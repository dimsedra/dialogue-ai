"use node";
import { generateText, jsonSchema } from "ai";
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createXai } from '@ai-sdk/xai';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq } from '@ai-sdk/groq';
import { createCohere } from '@ai-sdk/cohere';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAlibaba } from '@ai-sdk/alibaba';
import { huggingface } from '@ai-sdk/huggingface';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { ollama } from 'ollama-ai-provider';
import { opencode } from 'ai-sdk-provider-opencode-sdk';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { zhipu } from 'zhipu-ai-provider';

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
  mediaParts: any[];
  extractedTexts: string[];
  tools: any[];
}

export interface ChatEngineResult {
  text: string;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  reasoningContent?: string;
}

function parseXmlToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
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

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  togetherai: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  mistral: "https://api.mistral.ai/v1",
  cohere: "https://api.cohere.com/v1",
  moonshotai: "https://api.moonshot.cn/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
};

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  togetherai: "TOGETHERAI_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepinfra: "DEEPINFRA_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  moonshotai: "MOONSHOTAI_API_KEY",
  zhipu: "ZHIPU_API_KEY",
};

export function getVercelModel(provider: string, customConfigs: any, modelId?: string): any {
  const config = customConfigs?.[provider] || {};
  let apiKey = config.apiKey || "";
  let baseUrl = config.baseUrl || undefined;
  
  if (!baseUrl && provider === "lmstudio") {
    baseUrl = "http://localhost:1234/v1";
  }
  
  if (!apiKey) {
    const envKeyName = PROVIDER_ENV_KEYS[provider] || "OPENAI_API_KEY";
    apiKey = process.env[envKeyName] || "";
    if (provider === "lmstudio" && !apiKey) apiKey = "lm-studio";
    if (provider === "gemini" && !apiKey) apiKey = process.env.GEMINI_API_KEY || "";
    if (provider === "anthropic" && !apiKey) apiKey = process.env.ANTHROPIC_API_KEY || "";
  }

  const opts = { apiKey: apiKey || undefined, baseURL: baseUrl || undefined };
  const resolvedModelId = modelId || config.modelId;

  switch (provider) {
    case 'anthropic':
      return createAnthropic(opts)(resolvedModelId || 'claude-3-5-haiku-latest');
    case 'gemini':
      return createGoogleGenerativeAI(opts)(resolvedModelId || 'gemini-2.0-flash-lite');
    case 'deepseek':
      return createDeepSeek(opts)(resolvedModelId || 'deepseek-chat');
    case 'xai':
      return createXai(opts)(resolvedModelId || 'grok-2-latest');
    case 'mistral':
      return createMistral(opts)(resolvedModelId || 'mistral-large-latest');
    case 'groq':
      return createGroq(opts)(resolvedModelId || 'llama3-8b-8192');
    case 'cohere':
      return createCohere(opts)(resolvedModelId || 'command-r-plus');
    case 'moonshotai':
      return createMoonshotAI(opts)(resolvedModelId || 'moonshot-v1-8k');
    case 'deepinfra':
      return createDeepInfra(opts)(resolvedModelId || 'meta-llama/Meta-Llama-3.3-70B-Instruct');
    case 'togetherai':
      return createTogetherAI(opts)(resolvedModelId || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
    case 'fireworks':
      return createFireworks(opts)(resolvedModelId || 'accounts/fireworks/models/llama-v3p3-70b-instruct');
    case 'alibaba':
      return createAlibaba(opts)(resolvedModelId || 'qwen-turbo');
    case 'huggingface':
      return huggingface(resolvedModelId || 'meta-llama/Meta-Llama-3.3-70B-Instruct');
    case 'minimax':
      return createMinimax(opts)(resolvedModelId || 'minimax/minimax-m3');
    case 'ollama':
      return ollama(resolvedModelId || 'llama3.3');
    case 'opencode':
      return opencode(resolvedModelId || 'anthropic/claude-3-5-sonnet-20241022');
    case 'openrouter':
      return createOpenRouter(opts)(resolvedModelId || 'anthropic/claude-3.5-sonnet:beta');
    case 'zhipu':
      return zhipu(resolvedModelId || 'glm-4-plus');
    case 'lmstudio':
      return createOpenAI(opts)(resolvedModelId || 'default');
    default:
      return createOpenAI(opts)(resolvedModelId || 'gpt-4o-mini');
  }
}

export async function runChatEngine(options: ChatEngineOptions): Promise<ChatEngineResult> {
  const { provider, customConfigs, systemInstruction, transcript, userMessage, mediaParts, extractedTexts, tools } = options;

  const model = getVercelModel(provider, customConfigs) as any;
  
  const attachedTexts = extractedTexts.length > 0 
    ? `\n\nADDITIONAL ATTACHED FILE CONTENTS:\n${extractedTexts.join("\n\n---\n\n")}` 
    : "";

  const contentArray: any[] = [];
  contentArray.push({ type: "text", text: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}${attachedTexts}` });

  for (const part of mediaParts) {
    if (part.inlineData) {
      contentArray.push({
        type: "image",
        image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
      });
    }
  }

  const vercelTools: Record<string, any> = {};
  for (const fd of tools.flatMap((t: any) => t.functionDeclarations || [])) {
    vercelTools[fd.name] = {
      description: fd.description,
      parameters: jsonSchema({
        type: "object",
        properties: fd.parameters.properties,
        required: fd.parameters.required || []
      })
    };
  }

  const result = await generateText({
    model,
    system: systemInstruction,
    messages: [
      { role: "user", content: contentArray }
    ],
    tools: vercelTools,
  });

  const text = result.text;
  const calls = result.toolCalls ? result.toolCalls.map((tc: any) => ({
    name: tc.toolName,
    args: tc.args
  })) : [];

  const xmlCalls = parseXmlToolCalls(text);
  let cleanedText = text;
  if (xmlCalls.length > 0) {
    calls.push(...xmlCalls);
    cleanedText = cleanedText.replace(/<(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>[\s\S]*?<\/(?:[|｜][|｜]DSML[|｜][|｜])?tool_calls>/g, "").trim();
  }

  let reasoningContent: string | undefined = undefined;
  if (result.reasoning) {
    if (typeof result.reasoning === "string") {
      reasoningContent = result.reasoning;
    } else if (Array.isArray(result.reasoning)) {
      reasoningContent = (result.reasoning as any[])
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
    }
  }

  return {
    text: cleanedText,
    calls,
    reasoningContent
  };
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
  calls: Array<{ name: string; args: Record<string, unknown>; result?: any }>;
  executedActionSummaries: { name: string; summary: string; isSearch?: boolean }[];
  reasoningContent?: string;
}

export async function executeChatFollowUp(options: FollowUpOptions): Promise<string> {
  const { provider, customConfigs, systemInstruction, transcript, userMessage, calls, executedActionSummaries } = options;

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

  const model = getVercelModel(provider, customConfigs) as any;

  const messages: any[] = [
    { role: "user", content: `Conversation History:\n${transcript}\n\nUser's New Message: ${userMessage}` }
  ];

  if (calls.length > 0) {
    messages.push({
      role: "assistant",
      content: calls.map((c, i) => ({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: c.name,
        args: c.args
      }))
    });

    messages.push({
      role: "tool",
      content: calls.map((c, i) => {
        const summary = executedActionSummaries.find(s => s.name === c.name)?.summary || "Success";
        return {
          type: "tool-result",
          toolCallId: `call_${i}`,
          toolName: c.name,
          result: summary
        };
      })
    });
  }

  if (promptInstruction) {
    messages.push({ role: "user", content: promptInstruction });
  }

  const result = await generateText({
    model,
    system: cleanSystemInstruction,
    messages,
  });

  return cleanFollowUpText(result.text);
}

export interface TaskOptions {
  provider: string;
  customConfigs: any;
  prompt: string;
  systemInstruction?: string;
  modelId?: string;
}

export function getTaskProviderAndModel(profile: any, task: string): { provider: string; modelId: string } {
  const models = (profile?.preferences as any)?.taskModels || {};
  const taskModel = models[task];
  
  const mainProvider = (profile?.preferences as any)?.provider || "gemini";
  
  if (taskModel) {
    const lowerModel = taskModel.toLowerCase();
    if (lowerModel.includes("gpt-") || lowerModel.includes("dall-e") || lowerModel.startsWith("text-embedding")) {
      return { provider: "openai", modelId: taskModel };
    }
    if (lowerModel.includes("claude-")) {
      return { provider: "anthropic", modelId: taskModel };
    }
    if (lowerModel.includes("gemini-")) {
      return { provider: "gemini", modelId: taskModel };
    }
    if (lowerModel.includes("deepseek-")) {
      return { provider: "deepseek", modelId: taskModel };
    }
    if (lowerModel.includes("grok-")) {
      return { provider: "xai", modelId: taskModel };
    }
    if (lowerModel.includes("mistral-")) {
      return { provider: "mistral", modelId: taskModel };
    }
    if (lowerModel.includes("llama") || lowerModel.includes("qwen") || lowerModel.includes("phi")) {
      if (mainProvider === "lmstudio" || mainProvider === "ollama") {
        return { provider: mainProvider, modelId: taskModel };
      }
      return { provider: mainProvider, modelId: taskModel };
    }
    return { provider: mainProvider, modelId: taskModel };
  }
  
  const configs = (profile?.preferences as any)?.customConfigs || {};
  const mainModel = configs[mainProvider]?.modelId;
  
  let fallbackModel = mainModel;
  if (!fallbackModel) {
    if (mainProvider === "openai") fallbackModel = "gpt-4o-mini";
    else if (mainProvider === "anthropic") fallbackModel = "claude-3-5-haiku-latest";
    else if (mainProvider === "lmstudio") fallbackModel = "";
    else fallbackModel = "gemini-2.0-flash-lite";
  }
  
  return { provider: mainProvider, modelId: fallbackModel };
}

export async function runSimpleTask(options: TaskOptions): Promise<string> {
  const { provider, customConfigs, prompt, systemInstruction, modelId } = options;
  const model = getVercelModel(provider, customConfigs, modelId) as any;
  const result = await generateText({
    model,
    prompt,
    system: systemInstruction,
    temperature: 0.1,
  });
  return result.text;
}
