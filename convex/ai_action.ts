"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { GoogleGenerativeAI, SchemaType, Tool, Part } from "@google/generative-ai";
import mammoth from "mammoth";

const SKILLS_INSTRUCTION = `
## Agent Skills Reference
You are Dialogue, an assistant that shifts between two modes depending on the context:

## Adaptive Persona (The "Friend vs Focus" Dynamic):
You must dynamically read the room and adjust your behavior based on what the user says:
1. **The Friend Mode (Passive)**: If the user is just venting, sharing thoughts, chatting about hobbies, or asking general questions, DO NOT talk about productivity. Be a genuine, warm, and engaging friend. Let them talk about whatever they want without forcing them to "get back to work". 
2. **The Productivity Partner (Active)**: If the user explicitly mentions tasks, feeling overwhelmed, work, goals, or asks you to help them plan, shift into high gear. Be strategic, encouraging, and focused on momentum.
   - Cleverly nudge them toward their goals when appropriate, but only when they are in a working mindset.
   - If they seem stressed, suggest breaking tasks down into bite-sized chunks.

      ## STRICT RULES:
1. **VERIFY BEFORE ADDING/DELETING**: Never call 'addTask' or 'deleteTask' without explicit user confirmation.
2. **CLARIFY BEFORE ADDING**: When a user confirms they want to add a task, DO NOT just add it with defaults. Instead:
   - Ask for a **Priority** (low, medium, high).
   - Ask for a **Category** (e.g., Work, Personal, Side Project).
   - Ask for a **Due Date** or time.
   - Ask for any additional **Notes** or details if they seem relevant.
   - Example: "Got it! Should I set a priority for this, or maybe add some notes about the requirements?"
3. **PRECISE TIME PARSING**: When the user mentions a relative time (e.g., "tomorrow 7AM", "next Friday", "in 2 hours"), you MUST convert this to an absolute ISO-8601 string based on the "Current Time" provided below (e.g., "2026-05-15T07:00:00"). 
   - Always use the ISO-8601 format for the 'dueDate' field of 'addTask' to ensure calendar reliability.
   - You may still use human-readable dates in your chat response.
4. If a user mentions a potential task (e.g., "I need to do X"), ask: "Would you like me to add that to your tasks?"
5. If a user says they finished something or want to remove it, ask: "Should I remove '[Task Name]' from your list?"
6. Only call the tool AFTER they have provided the details they want to include, or if they say "just add it" / "doesn't matter".
8. **WORKSPACE AWARENESS**: You are always operating within a specific Workspace (e.g., Work, Personal, Side Project). Respect the "WORKSPACE GOAL/CONTEXT" provided below. Your advice, tone, and task suggestions should align with the specific purpose of the current workspace.

## Multimodal Capabilities:
You are a multimodal agent. You can see and analyze multiple images and documents (PDFs, Word docs, etc.) uploaded by the user.
1. **Acknowledge Attachments**: If a user uploads files, acknowledge them naturally in your response (e.g., "I've received those 3 images" or "I've read the project proposal you attached").
2. **Reason Across Files**: You can reason across multiple files simultaneously. Use this to compare documents, find patterns in images, or synthesize information from multiple sources.
3. **Contextual Analysis**: Use the content of files to inform your task suggestions and planning. For example, if a user uploads a meeting invite, you might suggest adding the meeting to their calendar.

## SKILLS:
### addTask
- Purpose: Use this skill ONLY AFTER verification AND clarification to save a task with full metadata. New tasks are automatically associated with the current workspace.
### completeTask
- Purpose: Use this skill ONLY AFTER verification to mark a task as finished.
### deleteTask
- Purpose: Use this skill ONLY AFTER verification to PERMANENTLY remove a task.
### addEvent
- Purpose: Use this skill ONLY AFTER verification to schedule a specific event with a start and end time. Events are time-blocks on a calendar.
- Requirement: You MUST provide 'startTime' and 'endTime' as absolute ISO-8601 strings.
### deleteEvent
- Purpose: Use this skill ONLY AFTER verification to remove a scheduled event.
### searchWeb
- Purpose: YOU MUST use this skill WHENEVER the user asks for real-time information.
- Multi-Search: You can and SHOULD perform multiple searches in a single turn if a complex query requires broad research (e.g., "Compare X and Y" should trigger two searches).
### updateMemory
- Purpose: Use this skill when you learn something new about the user's personality or preferences.
`;

export const chat = internalAction({
  args: {
    sessionId: v.id("chatSessions"),
    messageId: v.optional(v.id("messages")),
    text: v.string(),
    author: v.string(),
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileType: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set in environment variables.");
      await ctx.runMutation(api.messages.send, {
        sessionId: args.sessionId,
        text: "I'm sorry, I can't process your request right now because my API key is missing.",
        author: "AI",
      });
      return;
    }

    const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId });
    const workspaceId = session?.workspaceId;

    // 1. Fetch user profile and relevant memories
    const profile = await ctx.runQuery(api.ai.getProfile);
    const memories = await ctx.runQuery(api.ai.getLatestMemories);
    const personalityFragments = memories.map(m => m.text).join("\n- ");

    // Calculate local time based on offset if provided
    let nowString = "";
    if (args.timezoneOffset !== undefined) {
      const now = new Date();
      const localTime = new Date(now.getTime() - (args.timezoneOffset * 60000));
      nowString = localTime.toLocaleString("en-US", {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } else {
      nowString = new Date().toLocaleString("en-US", {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
      });
    }

    const workspace = workspaceId ? await ctx.runQuery(api.workspaces.get, { id: workspaceId }) : null;
    const workspaceContext = workspace?.context
      ? `ACTIVE WORKSPACE: "${workspace.name}"\nWORKSPACE GOAL/CONTEXT: "${workspace.context}"\nTailor your advice and tone to this specific context.`
      : "No specific workspace context provided.";

    const briefing = await ctx.runQuery(api.tasks.getDailyBriefing, { workspaceId });
    const pendingTasksContext = briefing.tasks.map(t => `- [${t._id}] ${t.text} (Priority: ${t.priority}, Category: ${t.category})`).join("\n");

    const upcomingEvents = await ctx.runQuery(api.events.list, { workspaceId });
    const upcomingEventsContext = upcomingEvents
      .filter(e => e.startTime > Date.now() - 3600000)
      .map(e => `- [${e._id}] ${e.title} (${new Date(e.startTime).toLocaleString()})`)
      .join("\n");

    let briefingContext = "";
    if (args.brief) {
      briefingContext = `
      USER REQUESTED A WORKSPACE SYNC.
      Current Time: ${nowString}
      Pending Tasks: ${JSON.stringify(briefing.tasks)}
      
      Provide a personalized, contextual "Sync" update. 
      - If it is morning: Help them start their day.
      - If it is midday/afternoon: Help them stay on track or reprioritize.
      - If it is evening/night: Help them wind down, review progress, or prepare for tomorrow.
      Tailor your tone and advice to the current time and the Workspace Context.
      `;
    }

    const systemInstruction = `
      ${SKILLS_INSTRUCTION}
      ${briefingContext}
 
      ${workspaceContext}

      Current Time: ${nowString}
      User Name: "${profile?.name || "User"}"
      User Personality Bio: "${profile?.bio || "New user."}"
      
      ## INSTRUCTION:
      Always address the user by their "User Name" if it is set to something other than "User". Use it naturally in your responses.

      Pending Tasks for Reference:
      ${pendingTasksContext || "No pending tasks."}
      
      Upcoming Events for Reference:
      ${upcomingEventsContext || "No upcoming events."}
      
      Personality Fragments (Relevant context from past chats):
      - ${personalityFragments || "No specific patterns learned yet."}
      
      Always prioritize the instructions in the Agent Skills Reference.
    `;

    // 2. Define Tools for Gemini
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "addTask",
            description: "Adds a new task to the user's list with optional priority and category.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                text: { type: SchemaType.STRING, description: "The task description" },
                dueDate: { type: SchemaType.STRING, description: "Optional due date or time (e.g. 'tomorrow 10pm')" },
                priority: { type: SchemaType.STRING, description: "Optional priority: 'low', 'medium', or 'high'" },
                category: { type: SchemaType.STRING, description: "Optional category (e.g. 'Work', 'Personal', 'Health')" },
                notes: { type: SchemaType.STRING, description: "Optional extra notes or context about the task" },
              },
              required: ["text"],
            },
          },
          {
            name: "completeTask",
            description: "Marks a task as finished/completed by its ID.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to complete (e.g. 'jh7...')" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "deleteTask",
            description: "PERMANENTLY removes a task from the user's list by its ID.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to delete (e.g. 'jh7...')" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "addEvent",
            description: "Schedules a new event with start and end times. Use this for time-specific calendar items.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING, description: "The event title" },
                description: { type: SchemaType.STRING, description: "Optional description" },
                startTime: { type: SchemaType.STRING, description: "ISO-8601 start time (e.g. 2026-05-15T14:00:00)" },
                endTime: { type: SchemaType.STRING, description: "ISO-8601 end time" },
                location: { type: SchemaType.STRING, description: "Optional location" },
                notes: { type: SchemaType.STRING, description: "Optional extra notes or context about the event" },
              },
              required: ["title", "startTime", "endTime"],
            },
          },
          {
            name: "deleteEvent",
            description: "Removes a scheduled event from the calendar by its ID.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                eventId: { type: SchemaType.STRING, description: "The ID of the event to delete" },
              },
              required: ["eventId"],
            },
          },
          {
            name: "updateMemory",
            description: "Updates the long-term memory/bio of the user.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                bio: { type: SchemaType.STRING, description: "The updated bio/personality summary" },
              },
              required: ["bio"],
            },
          },
          {
            name: "searchWeb",
            description: "YOU MUST call this whenever the user asks for news, real-time info, or facts you do not know. DO NOT apologize for lack of real-time data, use this tool instead.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: { type: SchemaType.STRING, description: "The search query to look up" },
              },
              required: ["query"],
            },
          },
        ],
      },
    ];

    try {
      const recentMessages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId });
      const transcript = recentMessages
        .filter(m => m.text !== args.text)
        .slice(-10)
        .map((msg) => {
          const attachmentContext = (msg.attachments || [])
            .map(a => `[File: ${a.fileName}${a.extractedText ? ` (Content: ${a.extractedText.substring(0, 500)}...)` : ""}]`)
            .join(" ");
          return `${msg.author}: ${attachmentContext ? attachmentContext + " " : ""}${msg.text}`;
        })
        .join("\n");

      let aiText = "";
      let activeToolCall = null;

      const genAI = new GoogleGenerativeAI(apiKey!);
      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite-preview",
        systemInstruction,
        tools,
      });

      const prompt = `
      Conversation History:
      ${transcript}

      User's New Message: ${args.text}
      `;

      const mediaParts: Part[] = [];
      const extractedTexts: string[] = [];
      const attachmentsToProcess = args.attachments || [];
      // Handle legacy single storageId
      if (args.storageId && !attachmentsToProcess.some(a => a.storageId === args.storageId)) {
        attachmentsToProcess.push({
          storageId: args.storageId,
          fileName: args.fileName || "unnamed_file",
          fileType: args.fileType || "application/octet-stream"
        });
      }

      for (const att of attachmentsToProcess) {
        const { storageId, fileName } = att;
        let mimeType = att.fileType;

        // Robust MIME type inference for common formats if generic
        if (mimeType === "application/octet-stream" || !mimeType) {
          const lowerName = fileName.toLowerCase();
          if (lowerName.endsWith(".png")) mimeType = "image/png";
          else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
          else if (lowerName.endsWith(".webp")) mimeType = "image/webp";
          else if (lowerName.endsWith(".gif")) mimeType = "image/gif";
          else if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
        }
        const fileBytes = await ctx.storage.get(storageId);
        
        if (fileBytes) {
          const isNativeMultimodal = 
            mimeType.startsWith("image/") || 
            mimeType === "application/pdf" ||
            mimeType.startsWith("video/") ||
            mimeType.startsWith("audio/");

          const isTextExtractable = 
            mimeType === "text/plain" ||
            mimeType === "text/csv" ||
            mimeType === "text/javascript" ||
            mimeType === "text/python" ||
            mimeType === "text/markdown" ||
            mimeType === "application/x-javascript" ||
            mimeType === "application/json" ||
            fileName.endsWith(".md");

          const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                         fileName.endsWith(".docx");

          if (isNativeMultimodal) {
            const arrayBuffer = await fileBytes.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString("base64");
            
            mediaParts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            });
          } else if (isDocx) {
            try {
              const arrayBuffer = await fileBytes.arrayBuffer();
              const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
              const extractedValue = result.value;
              extractedTexts.push(`[CONTENT OF WORD DOC: ${fileName}]\n${extractedValue}`);
              if (args.messageId) {
                await ctx.runMutation(internal.messages_internal.saveExtractedText, {
                  messageId: args.messageId,
                  storageId,
                  text: extractedValue
                });
              }
            } catch (err) {
              console.error(`Error extracting text from DOCX ${fileName}:`, err);
            }
          } else if (isTextExtractable) {
            try {
              const text = await fileBytes.text();
              extractedTexts.push(`[CONTENT OF FILE: ${fileName}]\n${text}`);
              if (args.messageId) {
                await ctx.runMutation(internal.messages_internal.saveExtractedText, {
                  messageId: args.messageId,
                  storageId,
                  text: text
                });
              }
            } catch (err) {
              console.error(`Error reading text file ${fileName}:`, err);
            }
          } else {
            console.warn(`Unsupported MIME type for Gemini: ${mimeType}. Skipping attachment ${storageId}`);
          }
        }
      }

      const promptParts: (string | Part)[] = [
        prompt, 
        ...mediaParts,
        ...(extractedTexts.length > 0 ? [`\n\nADDITIONAL ATTACHED FILE CONTENTS:\n${extractedTexts.join("\n\n---\n\n")}`] : [])
      ];
      const result = await model.generateContent(promptParts);
      const response = result.response;

      const calls = response.functionCalls();
      if (calls && calls.length > 0) {
        const searchCalls = calls.filter(c => c.name === "searchWeb");
        const otherCalls = calls.filter(c => c.name !== "searchWeb");

        for (const call of otherCalls) {
          if (call.name === "addTask") {
            const taskArgs = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...(call.args as any),
              workspaceId
            };
            await ctx.runMutation(api.ai.addTask, taskArgs);
            activeToolCall = { name: "addTask", args: call.args };
          } else if (call.name === "completeTask") {
            const { taskId } = call.args as { taskId: string };
            await ctx.runMutation(api.tasks.toggleCompleted, { id: taskId as Id<"tasks"> });
            activeToolCall = { name: "completeTask", args: call.args };
          } else if (call.name === "deleteTask") {
            const { taskId } = call.args as { taskId: string };
            await ctx.runMutation(api.tasks.deleteTask, { id: taskId as Id<"tasks"> });
            activeToolCall = { name: "deleteTask", args: call.args };
          } else if (call.name === "addEvent") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const eventArgs = call.args as any;
            await ctx.runMutation(api.events.add, {
              ...eventArgs,
              startTime: new Date(eventArgs.startTime).getTime(),
              endTime: new Date(eventArgs.endTime).getTime(),
              workspaceId
            });
            activeToolCall = { name: "addEvent", args: call.args };
          } else if (call.name === "deleteEvent") {
            const { eventId } = call.args as { eventId: string };
            await ctx.runMutation(api.events.remove, { id: eventId as Id<"events"> });
            activeToolCall = { name: "deleteEvent", args: call.args };
          } else if (call.name === "updateMemory") {
            const args = call.args as { bio: string };
            await ctx.runMutation(api.ai.updateProfile, args);
            activeToolCall = { name: "updateMemory", args: call.args };
          }
        }

        if (searchCalls.length > 0) {
          const tavilyKey = process.env.TAVILY_API_KEY;
          const serperKey = process.env.SERPER_API_KEY;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchProvider = (profile?.preferences as any)?.searchProvider || "tavily";
          
          const searchResults = await Promise.all(searchCalls.map(async (call) => {
            const { query } = call.args as { query: string };
            let content = "Search failed.";
            
            if (searchProvider === "serper" && serperKey) {
              try {
                const serperRes = await fetch("https://google.serper.dev/search", {
                  method: "POST",
                  headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
                  body: JSON.stringify({ q: query }),
                });
                const serperData = await serperRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content = serperData.organic ? serperData.organic.map((r: any) => r.snippet).join("\n") : "No results found.";
              } catch {
                content = `Error searching Serper for "${query}"`;
              }
            } else if (tavilyKey) {
              try {
                const tvlyRes = await fetch("https://api.tavily.com/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ api_key: tavilyKey, query, include_answer: true }),
                });
                const tvlyData = await tvlyRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content = tvlyData.answer || (tvlyData.results ? tvlyData.results.map((r: any) => r.content).join("\n") : "No results found.");
              } catch {
                content = `Error searching Tavily for "${query}"`;
              }
            }
            return { name: "searchWeb", response: { result: content } };
          }));

          activeToolCall = { name: "multiSearch", args: { count: searchCalls.length } };

          const feedbackPrompt = {
            contents: [
              { role: "user", parts: [{ text: prompt }] },
              { role: "model", parts: response.candidates?.[0]?.content?.parts || [] },
              { role: "user", parts: searchResults.map(res => ({ functionResponse: res })) }
            ]
          };
          const finalResult = await model.generateContent(feedbackPrompt);
          aiText = finalResult.response.text();
        }

        if (!aiText) {
          try {
            aiText = response.text();
          } catch {
            aiText = "I've processed that for you.";
          }
        }
      } else {
        aiText = response.text();
      }

      // 4. Send response with toolCall info
      await ctx.runMutation(api.messages.send, {
        sessionId: args.sessionId,
        text: aiText || "I've processed your request.",
        author: "AI",
        toolCall: activeToolCall ? {
          name: activeToolCall.name,
          args: activeToolCall.args,
          result: { status: "success" }
        } : undefined
      });

      // 5. Silent Reflection (Throttled: Run only every 20 messages to avoid over-sensitivity)
      // Re-use recentMessages from earlier in the handler
      if (recentMessages.length % 20 === 0) {
        await ctx.scheduler.runAfter(0, internal.ai_action.reflectOnPersonality, { sessionId: args.sessionId });
      }

      // Auto-title if it's the first few messages and title is default
      if (recentMessages.length >= 1 && recentMessages.length <= 4) {
        const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId });
        if (session && session.title && (session.title.startsWith("Chat") || session.title === "New Chat")) {
          await ctx.scheduler.runAfter(0, internal.ai_action.generateSessionTitle, { sessionId: args.sessionId });
        }
      }

    } catch (error) {
      console.error("Gemini API Error Detail:", error);
      await ctx.runMutation(api.messages.send, {
        sessionId: args.sessionId,
        text: "I encountered an error while thinking. Could you try rephrasing?",
        author: "AI",
      });
    }
  },
});

export const reflectOnPersonality = internalAction({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    // Fetch last 20 messages for more context
    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId });
    const transcript = messages.map(m => `${m.author === "User" ? "HUMAN" : "ASSISTANT"}: ${m.text}`).join("\n");

    // Fetch existing memories to avoid duplicates
    const existingMemories = await ctx.runQuery(api.ai.getAllMemories);
    const memoryContext = existingMemories.map(m => `- ${m.text}`).join("\n");

    const prompt = `
      You are a high-intelligence personality analyst for a personal AI agent. 
      Analyze the transcript below to extract SHARP, high-value insights about the HUMAN user.
      
      ## CRITICAL CONSTRAINT:
      You MUST ONLY extract insights from the HUMAN's behavior, preferences, and style. 
      DO NOT learn from the ASSISTANT's suggestions, actions, or tone. If the assistant suggests something and the user merely agrees, that is a pattern of the user's preference, but do not mistake assistant hallucinations for user traits.
      
      ## CURRENT MEMORIES (Ignore these, do not repeat):
      ${memoryContext || "None yet."}

      ## GOAL:
      Identify 1-2 NEW, stable patterns in:
      1. Human's Working Style: (e.g., "Prefers direct, technical answers")
      2. Human's Life Context: (e.g., "Working on a startup named Atmos")
      3. Human's Personality: (e.g., "Values precision over speed")
      4. Human's Recurring Friction: (e.g., "Dislikes overly apologetic tone")

      ## CRITICAL RULES:
      - Focus EXCLUSIVELY on identifying the HUMAN's unique signature.
      - Be extremely selective. If nothing new or stable is found, return "NULL".
      - Avoid trivialities (e.g., "User is asking a question").
      - Use "Active Voice" and be punchy.
      - Do NOT include any intro or outro. Just the insights, one per line.

      Transcript:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const rawInsights = result.response.text().split("\n");

    for (const line of rawInsights) {
      const insight = line.trim();
      if (!insight || insight === "NULL" || insight.length < 10) continue;

      // Basic check for duplicates if AI ignored instructions
      const isDuplicate = existingMemories.some(m =>
        m.text.toLowerCase().includes(insight.toLowerCase()) ||
        insight.toLowerCase().includes(m.text.toLowerCase())
      );

      if (!isDuplicate) {
        const dummyEmbedding = Array(768).fill(0).map(() => Math.random());
        await ctx.runMutation(api.ai.saveMemory, { text: insight, embedding: dummyEmbedding });
        console.log("Captured new intelligence:", insight);
      }
    }
  }
});

export const generateSessionTitle = internalAction({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId });
    const transcript = messages.map(m => `${m.author}: ${m.text}`).join("\n");

    const prompt = `Based on the following conversation, generate a very short, creative, and descriptive title (maximum 3-4 words). 
    Do not use quotes or special characters.
    Transcript:
    ${transcript}`;

    const result = await model.generateContent(prompt);
    const title = result.response.text().trim().replace(/["']/g, '');

    if (title && title.length > 2) {
      await ctx.runMutation(api.messages.updateSessionTitle, { id: args.sessionId, title });
    }
  }
});
