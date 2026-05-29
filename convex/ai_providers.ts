"use node";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

export const PROVIDER_CAPABILITIES: Record<string, { multimodal: boolean }> = {
  gemini: { multimodal: true },
  openai: { multimodal: false },
  anthropic: { multimodal: false },
  lmstudio: { multimodal: false },
};

export interface ChatEngineOptions {
  provider: string;
  customConfigs: any;
  systemInstruction: string;
  transcript: string;
  userMessage: string;
  mediaParts: Part[];
  extractedTexts: string[];
  tools: any[];
}

export interface ChatEngineResult {
  text: string;
  calls: Array<{ name: string; args: Record<string, unknown>; originalGeminiCall?: any }>;
  reasoningContent?: string;
  rawModelParts?: any[];
}

function parseXmlToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // Match both plain <tool_calls> and <||DSML||tool_calls> variants
  const toolCallsRegex = /<(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>([\s\S]*?)<\/(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>/g;
  let match;
  while ((match = toolCallsRegex.exec(text)) !== null) {
    const blockContent = match[1];
    const invokeRegex = /<(?:[|｜][|｜]DSML[|｜][|｜])?invoke\s+name="([^"]+)"(?:[^>]*)?>([\s\S]*?)<\/(?:[|｜][|｜]DSML[|｜][|｜])?invoke>/g;
    let invokeMatch;
    while ((invokeMatch = invokeRegex.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1];
      const invokeContent = invokeMatch[2];
      const args: Record<string, unknown> = {};
      const paramRegex = /<(?:[|｜][|｜]DSML[|｜][|｜])?parameter\s+name="([^"]+)"(?:[^>]*)?>([\s\S]*?)<\/(?:[|｜][|｜]DSML[|｜][|｜])?parameter>/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
        const paramName = paramMatch[1];
        const rawValue = paramMatch[2];
        const isNumber = /^\d+(\.\d+)?$/.test(rawValue);
        const isBool = rawValue === "true" || rawValue === "false";
        if (isNumber) {
          args[paramName] = Number(rawValue);
        } else if (isBool) {
          args[paramName] = rawValue === "true";
        } else {
          args[paramName] = rawValue;
        }
      }
      calls.push({ name: toolName, args });
    }
  }
  return calls;
}

export async function runChatEngine(options: ChatEngineOptions): Promise<ChatEngineResult> {
  const { provider, customConfigs, systemInstruction, transcript, userMessage, mediaParts, extractedTexts, tools } = options;

  const config = customConfigs?.[provider] || {};
  let apiKey = config.apiKey || "";
  let baseUrl = config.baseUrl || undefined;
  if (!baseUrl && provider === "lmstudio") {
    baseUrl = "http://localhost:1234/v1";
  }
  const modelId = config.modelId || undefined;

  // Format attached files
  const attachedTexts = extractedTexts.length > 0 
    ? `\n\nADDITIONAL ATTACHED FILE CONTENTS:\n${extractedTexts.join("\n\n---\n\n")}` 
    : "";

  if (provider === "openai" || provider === "lmstudio") {
    if (!apiKey && provider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
    // LMStudio might not need an API key
    if (!apiKey && provider === "lmstudio") apiKey = "lm-studio";

    const openai = new OpenAI({ apiKey, baseURL: baseUrl });

    const openAiTools = tools.flatMap((t: any) => t.functionDeclarations).map((fd: any) => {
      return {
        type: "function" as const,
        function: {
          name: fd.name,
          description: fd.description,
          parameters: {
            type: "object" as const,
            properties: fd.parameters.properties,
            required: fd.parameters.required || []
          }
        }
      };
    });

    const contentArray: any[] = [];
    contentArray.push({ type: "text", text: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}${attachedTexts}` });

    for (const part of mediaParts) {
      if (part.inlineData) {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        });
      }
    }

    const response = await openai.chat.completions.create({
      model: modelId || "gpt-5.5",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: contentArray as any }
      ],
      tools: openAiTools,
      tool_choice: "auto",
    });

    const msg = response.choices[0].message;
    let text = msg.content || "";
    const calls: any[] = msg.tool_calls?.map(tc => {
      if (tc.type === "function") {
        return {
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        };
      }
      return null;
    }).filter(Boolean) || [];

    const xmlCalls = parseXmlToolCalls(text);
    if (xmlCalls.length > 0) {
      calls.push(...xmlCalls);
      text = text.replace(/<(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>[\s\S]*?<\/(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>/g, "").trim();
    }

    const reasoningContent = (msg as any).reasoning_content || (msg as any).thinking || undefined;
    return { text, calls, reasoningContent };

  } else if (provider === "anthropic") {
    if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY || "";

    const anthropic = new Anthropic({ apiKey, baseURL: baseUrl });

    const anthropicTools = tools.flatMap((t: any) => t.functionDeclarations).map((fd: any) => {
      const inputSchema = {
        type: "object" as const,
        properties: fd.parameters.properties,
        required: fd.parameters.required || []
      };
      return {
        name: fd.name,
        description: fd.description,
        input_schema: inputSchema
      };
    });

    const contentArray: any[] = [];
    
    for (const part of mediaParts) {
      if (part.inlineData) {
        contentArray.push({
          type: "image",
          source: {
            type: "base64",
            media_type: part.inlineData.mimeType as any,
            data: part.inlineData.data
          }
        });
      }
    }
    
    contentArray.push({ type: "text", text: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}${attachedTexts}` });

    const response = await anthropic.messages.create({
      model: modelId || "claude-sonnet-4.6",
      max_tokens: 4096,
      system: systemInstruction,
      messages: [
        { role: "user", content: contentArray as any }
      ],
      tools: anthropicTools,
    });

    let text = "";
    const calls: Array<{name: string, args: any}> = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        calls.push({
          name: block.name,
          args: block.input as any
        });
      }
    }

    return { text, calls };

  } else {
    // Default to Gemini
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY || "";
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelId || "gemini-2.0-flash",
      systemInstruction,
      tools,
    }, { baseUrl });

    const promptParts: (string | Part)[] = [
      `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}${attachedTexts}`,
      ...mediaParts,
    ];

    let result;
    try {
      result = await model.generateContent(promptParts);
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes("429")) {
        throw new Error("Rate Limit");
      }
      throw err;
    }

    const response = result.response;
    const text = response.text() || "";
    const fnCalls = response.functionCalls();
    
    const calls = fnCalls ? fnCalls.map(c => ({
      name: c.name,
      args: c.args as Record<string, unknown>,
      originalGeminiCall: c
    })) : [];

    const rawModelParts = response.candidates?.[0]?.content?.parts;

    return { text, calls, rawModelParts };
  }
}
function cleanFollowUpText(text: string): string {
  return text.replace(/<(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>[\s\S]*?<\/(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>/g, "").trim();
}

export interface FollowUpOptions {
  provider: string;
  customConfigs: any;
  systemInstruction: string;
  transcript: string;
  userMessage: string;
  calls: Array<{ name: string; args: Record<string, unknown>; result?: any; originalGeminiCall?: any }>;
  executedActionSummaries: { name: string; summary: string; isSearch?: boolean }[];
  reasoningContent?: string;
  rawModelParts?: any[];
}

export async function executeChatFollowUp(options: FollowUpOptions): Promise<string> {
  const { provider, customConfigs, systemInstruction, transcript, userMessage, calls, executedActionSummaries, reasoningContent, rawModelParts } = options;
  const config = customConfigs?.[provider] || {};
  let apiKey = config.apiKey || "";
  let baseUrl = config.baseUrl || undefined;
  if (!baseUrl && provider === "lmstudio") {
    baseUrl = "http://localhost:1234/v1";
  }
  const modelId = config.modelId || undefined;

  const hasSearch = executedActionSummaries.some(s => s.isSearch);
  const hasDbAction = executedActionSummaries.some(s => !s.isSearch);

  let promptInstruction = "";
  if (hasSearch && !hasDbAction) {
    promptInstruction = "The search results for the user's query are provided above. Now, write a natural, comprehensive, and conversational response addressing the user's comments and directly answering their question using the search results. Respond in the same language the user used in their query. CRITICAL: Do NOT output any internal instructions, scratchpad notes, or raw tool blocks.";
  } else if (hasSearch && hasDbAction) {
    promptInstruction = "The database actions were executed successfully and the search results are provided above. Now, write a natural, conversational response that confirms the actions were taken and directly answers the user's query using the search results. Respond in the same language the user used in their query. CRITICAL: Do NOT output any internal instructions, scratchpad notes, or raw tool blocks.";
  } else {
    promptInstruction = "The requested actions were successfully executed in the database. Now, output ONLY your natural, conversational confirmation addressed directly to the user, using the EXACT same language the user used in their query. CRITICAL: Do NOT repeat or output any internal prompt instructions, scratchpad notes, or thought processes.";
  }

  // Clean system instruction to strip tool definitions and skills rules
  let cleanSystemInstruction = systemInstruction;
  const skillsIndex = systemInstruction.indexOf("## Agent Skills Reference");
  if (skillsIndex !== -1) {
    cleanSystemInstruction = systemInstruction.substring(0, skillsIndex).trim();
  }
  
  cleanSystemInstruction += `
    
    ## FOLLOW-UP ROLE:
    You are currently in a follow-up turn. The user's requested actions (including searches or database updates) have been executed. 
    The results/outputs of these actions are provided in the history.
    Write a natural, conversational response directly addressing the user's comments and answering their query using these results.
    
    CRITICAL FOLLOW-UP RULES:
    1. Respond in the EXACT same language the user used in their message (e.g. English, casual/natural Indonesian).
    2. Do NOT output any raw tool blocks, XML tags, or code snippets representing tool execution.
    3. Do NOT greet the user (e.g. do not say "Hi", "Hello") since this is a continuation of the conversation turn.
  `;

  if (provider === "openai" || provider === "lmstudio") {
    if (!apiKey && provider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey && provider === "lmstudio") apiKey = "lm-studio";

    const openai = new OpenAI({ apiKey, baseURL: baseUrl });

    const isDeepSeek = modelId?.toLowerCase().includes("deepseek") || provider === "lmstudio";

    if (isDeepSeek) {
      const assistantText = calls.map(c => `[Tool Call]: ${c.name}(${JSON.stringify(c.args)})`).join("\n");
      const toolResponseText = executedActionSummaries.map(s => `[Tool Output - ${s.name}]:\n${s.summary}`).join("\n\n");

      const messages: any[] = [
        { role: "system", content: cleanSystemInstruction },
        { role: "user", content: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}` },
        { role: "assistant", content: assistantText },
        { role: "user", content: `Here are the tool execution results:\n\n${toolResponseText}\n\n${promptInstruction}` }
      ];

      const response = await openai.chat.completions.create({
        model: modelId || "default",
        messages
      });

      return cleanFollowUpText(response.choices[0].message.content || "");
    }

    const assistantMsg: any = { 
      role: "assistant", 
      tool_calls: calls.map((c, i) => ({ id: `call_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }))
    };
    if (reasoningContent) {
      assistantMsg.reasoning_content = reasoningContent;
    }

    const messages: any[] = [
      { role: "system", content: cleanSystemInstruction },
      { role: "user", content: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}` },
      assistantMsg
    ];

    calls.forEach((c, i) => {
      const summary = executedActionSummaries.find(s => s.name === c.name)?.summary || "Success";
      messages.push({
        role: "tool",
        tool_call_id: `call_${i}`,
        name: c.name,
        content: summary
      });
    });

    if (promptInstruction) {
      messages.push({ role: "user", content: promptInstruction });
    }

    const response = await openai.chat.completions.create({
      model: modelId || "gpt-5.5",
      messages
    });

    return cleanFollowUpText(response.choices[0].message.content || "");

  } else if (provider === "anthropic") {
    if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY || "";
    const anthropic = new Anthropic({ apiKey, baseURL: baseUrl });

    const messages: any[] = [
      { role: "user", content: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}` },
      {
        role: "assistant",
        content: calls.map((c, i) => ({ type: "tool_use", id: `toolu_${i}`, name: c.name, input: c.args }))
      }
    ];

    const toolResultContent = calls.map((c, i) => {
      const summary = executedActionSummaries.find(s => s.name === c.name)?.summary || "Success";
      return { type: "tool_result", tool_use_id: `toolu_${i}`, content: summary };
    });

    messages.push({ role: "user", content: toolResultContent as any });
    
    if (promptInstruction) {
      messages.push({ role: "user", content: promptInstruction });
    }

    const response = await anthropic.messages.create({
      model: modelId || "claude-sonnet-4.6",
      max_tokens: 4096,
      system: cleanSystemInstruction,
      messages
    });

    const rawText = response.content.filter(c => c.type === "text").map((c: any) => c.text).join("") || "";
    return cleanFollowUpText(rawText);

  } else {
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY || "";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId || "gemini-2.0-flash", systemInstruction: cleanSystemInstruction }, { baseUrl });

    const functionCalls = calls.map(c => ({ functionCall: { name: c.name, args: c.args } }));
    const functionResponses = calls.map(c => {
      const summary = executedActionSummaries.find(s => s.name === c.name)?.summary || "Success";
      return { functionResponse: { name: c.name, response: { status: "success", executionDetails: summary, result: summary } } };
    });

    const promptParts = [
      { role: "user", parts: [{ text: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}` }] },
      { role: "model", parts: rawModelParts || functionCalls },
      { role: "user", parts: [...functionResponses, ...(promptInstruction ? [{ text: promptInstruction }] : [])] }
    ];

    const response = await model.generateContent({ contents: promptParts as any });
    const rawText = response.response.text() || "";
    return cleanFollowUpText(rawText);
  }
}

export interface TaskOptions {
  provider: string;
  customConfigs: any;
  prompt: string;
  systemInstruction?: string;
  modelId?: string;
}

export async function runSimpleTask(options: TaskOptions): Promise<string> {
  const { provider, customConfigs, prompt, systemInstruction, modelId } = options;
  const config = customConfigs?.[provider] || {};
  let apiKey = config.apiKey || "";
  let baseUrl = config.baseUrl || undefined;
  if (!baseUrl && provider === "lmstudio") {
    baseUrl = "http://localhost:1234/v1";
  }
  const resolvedModelId = modelId || config.modelId;

  if (provider === "openai" || provider === "lmstudio") {
    if (!apiKey && provider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey && provider === "lmstudio") apiKey = "lm-studio";

    const openai = new OpenAI({ apiKey, baseURL: baseUrl });
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: "system" as const, content: systemInstruction });
    }
    messages.push({ role: "user" as const, content: prompt });

    const response = await openai.chat.completions.create({
      model: resolvedModelId || "gpt-4o-mini",
      messages,
      temperature: 0.1,
    });
    return response.choices[0].message.content || "";

  } else if (provider === "anthropic") {
    if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY || "";

    const anthropic = new Anthropic({ apiKey, baseURL: baseUrl });
    const response = await anthropic.messages.create({
      model: resolvedModelId || "claude-3-5-haiku-latest",
      max_tokens: 1000,
      system: systemInstruction,
      messages: [{ role: "user" as const, content: prompt }],
      temperature: 0.1,
    });
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
    return text;

  } else {
    // Default to Gemini
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY || "";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: resolvedModelId || "gemini-2.0-flash-lite",
      systemInstruction,
    }, { baseUrl });

    const result = await model.generateContent(prompt);
    return result.response.text() || "";
  }
}

