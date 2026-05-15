"use node";
import { internalAction, action } from "./_generated/server";
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
1. **VERIFICATION & PERFECTION POLICY**: Never call 'addTask', 'updateTask', 'addEvent', or 'deleteTask' without explicit user confirmation of the exact details. You must ensure the information you've gathered is **perfect as the user intended**.
2. **CLARIFY & CONFIRM BEFORE ADDING**: When a user wants to add a task/event, you must gather and confirm the following before execution:
   - **Priority** (low, medium, high).
   - **Category** (e.g., Work, Personal, Side Project).
   - **Due Date / Time** (Use the Time Integrity Protocol).
   - **Notes** or specific details.
   - **Action**: Summarize the plan (e.g., "I'll add 'Project Review' for 14:00 with High priority in 'Work'. Sound right?") and only call the tool AFTER they confirm.
3. **ZERO ASSUMPTION POLICY**: If a detail is missing or ambiguous, ASK. Do not guess or use defaults unless the user says "just add it" or "you decide".
4. **PRECISE TIME PARSING (TIME INTEGRITY PROTOCOL)**: When the user mentions a relative time, you MUST convert this to an absolute ISO-8601 string based on the "Current Time" provided below (e.g., "2026-05-15T07:00:00"). 
   - You MUST ALWAYS use 24-hour military time in your ISO-8601 strings (e.g., 6:00 PM is 18:00:00).
   - The 'Current Time' you are given is already pre-adjusted to the user's local timezone. You do not need to calculate offsets.
5. If a user mentions a potential task (e.g., "I need to do X"), ask: "Would you like me to add that to your tasks?"
6. If a user says they finished something or want to remove it, ask: "Should I remove '[Task Name]' from your list?"
7. Only call the tool AFTER the user explicitly says the plan is perfect.
8. **GRACEFUL CANCELLATION**: If a user declines a plan, says "never mind", "cancel that", or expresses they no longer want to proceed with a task/event after you've proposed it, acknowledge the cancellation warmly and confirm that you have NOT taken any action. Do not call the tool.
9. **WORKSPACE AWARENESS**: You are always operating within a specific Workspace (e.g., Work, Personal, Side Project). Respect the "WORKSPACE GOAL/CONTEXT" provided below. Your advice, tone, and task suggestions should align with the specific purpose of the current workspace.
10. **NATURAL EXPRESSION MANDATE**: Never use rigid, repetitive, or "bot-like" sentence templates for tool confirmations. Avoid "I have added [X] to your list." Instead, weave confirmations into natural prose (e.g., "All set! I've carved out that hour for your workout so you can focus on hitting your goals."). Do not start every response with "Got it," "Understood," or "Okay." Vary your tone and sentence structure constantly.
11. **MANDATORY CONVERSATIONAL TEXT**: Every turn where you call a tool MUST also include a natural language part. You are forbidden from sending a tool call in isolation. Tell the user what you are doing in your warm, adaptive tone.
12. **MULTILINGUAL FLUIDITY**: You must always respond in the same language the user is using. If the user speaks Indonesian, respond in natural, warm, and culturally appropriate Indonesian. Adapt your slang and level of formality to match the user's vibe. Crucially, when calling tools (like addTask or addEvent), all user-visible strings (titles, descriptions, notes) MUST be in the same language the user used. Technical fields like ISO dates or priority levels must remain in their specified formats.
13. **WORKSPACE PRECEDENCE**: The "WORKSPACE CONTEXT" provided below is your **ABSOLUTE AUTHORITY**. It defines your persona, goals, and rules for the current session. You must prioritize these instructions over your default "Adaptive Persona". If the context demands a specific tone (e.g., cynical, formal, or strict), adopt it fully and do not blend it with your default personality.

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
- Requirement: You MUST provide 'startTime' and 'endTime' as absolute ISO-8601 strings in 24-hour format.
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
    userId: v.id("users"),
    messageId: v.optional(v.id("messages")),
    text: v.string(),
    author: v.string(),
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    dueDate: v.optional(v.number()),
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
      await ctx.runMutation(internal.messages.internalSend, {
        sessionId: args.sessionId,
        text: "I'm sorry, I can't process your request right now because my API key is missing.",
        author: "AI",
      });
      return;
    }

    const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId });
    const workspaceId = session?.workspaceId;

    // 1. Fetch user profile and relevant memories
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId });
    const memories = await ctx.runQuery(api.ai.getLatestMemories, { userId: args.userId });
    const personalityFragments = memories.map(m => m.text).join("\n- ");

    // Calculate local time based on offset if provided
    let nowString = "";
    if (args.timezoneOffset !== undefined) {
      const now = new Date();
      const localTime = new Date(now.getTime() - (args.timezoneOffset * 60000));
      nowString = localTime.toLocaleString("en-US", {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } else {
      nowString = new Date().toLocaleString("en-US", {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short'
      });
    }

    const workspace = workspaceId ? await ctx.runQuery(api.workspaces.get, { id: workspaceId, userId: args.userId }) : null;
    const workspaceContext = workspace?.context
      ? `ACTIVE WORKSPACE: "${workspace.name}"\nWORKSPACE CONTEXT/RULES: "${workspace.context}"\n(Reminder: This context takes precedence over your default persona)`
      : "No specific workspace context provided. Follow your default adaptive persona.";

    const briefing = await ctx.runQuery(api.tasks.getDailyBriefing, { workspaceId, userId: args.userId });
    const pendingTasksContext = briefing.tasks.map(t => {
      const eventDate = t.dueDate ? (
        args.timezoneOffset !== undefined 
          ? new Date(t.dueDate - (args.timezoneOffset * 60000)) 
          : new Date(t.dueDate)
      ) : null;
      const dateStr = eventDate ? ` | Due: ${eventDate.toLocaleString("en-US", { hour12: false })}` : "";
      return `- [${t._id}] ${t.text}${dateStr} (Priority: ${t.priority}, Category: ${t.category})`;
    }).join("\n");

    const upcomingEvents = await ctx.runQuery(api.events.list, { workspaceId, userId: args.userId });
    const upcomingEventsContext = upcomingEvents
      .filter(e => e.startTime > Date.now() - 3600000)
      .map(e => {
        const eventDate = args.timezoneOffset !== undefined
          ? new Date(e.startTime - (args.timezoneOffset * 60000))
          : new Date(e.startTime);
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })})`;
      })
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
            description: "Adds a new task to the user's list. Use for things to do.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                text: { type: SchemaType.STRING, description: "The task description" },
                dueDate: { type: SchemaType.STRING, description: "ISO-8601 due date/time (24-hour format, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                priority: { type: SchemaType.STRING, description: "Priority level: 'low', 'medium', or 'high'" },
                category: { type: SchemaType.STRING, description: "Optional category" },
                notes: { type: SchemaType.STRING, description: "Optional extra notes" },
              },
              required: ["text"],
            },
          }, {
            name: "updateTask",
            description: "Updates an existing task.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to update" },
                text: { type: SchemaType.STRING, description: "Updated text" },
                completed: { type: SchemaType.BOOLEAN, description: "Whether the task is finished" },
                dueDate: { type: SchemaType.STRING, description: "Updated ISO-8601 due date (24-hour, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                priority: { type: SchemaType.STRING, description: "Updated priority: 'low', 'medium', or 'high'" },
                category: { type: SchemaType.STRING },
                notes: { type: SchemaType.STRING },
              },
              required: ["taskId"],
            },
          }, {
            name: "deleteTask",
            description: "Deletes a task.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to delete" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "addEvent",
            description: "Adds a new event to the calendar. Use for meetings or time blocks.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING, description: "Event title" },
                description: { type: SchemaType.STRING, description: "Optional description" },
                startTime: { type: SchemaType.STRING, description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                endTime: { type: SchemaType.STRING, description: "ISO-8601 end time (24-hour format)." },
                location: { type: SchemaType.STRING, description: "Optional location" },
                notes: { type: SchemaType.STRING, description: "Optional notes" },
              },
              required: ["title", "startTime", "endTime"],
            },
          },
          {
            name: "updateEvent",
            description: "Updates an existing scheduled event by its ID. Provide only the fields you want to change.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                eventId: { type: SchemaType.STRING, description: "The ID of the event to update" },
                title: { type: SchemaType.STRING, description: "The new event title" },
                startTime: { type: SchemaType.STRING, description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T11:50:00')" },
                endTime: { type: SchemaType.STRING, description: "ISO-8601 end time (24-hour format, e.g. '2026-05-15T13:00:00')" },
                location: { type: SchemaType.STRING, description: "Optional new location" },
                notes: { type: SchemaType.STRING, description: "Optional new notes" },
              },
              required: ["eventId"],
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

        const parseLocal = (s: string) => {
          const match = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
          if (match) {
            const [, y, m, d, h, min] = match;
            const utcBase = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
            // Industry Standard: Store as true UTC (Local Intent + Offset)
            // Note: getTimezoneOffset() is (UTC - Local), so adding it converts Local to UTC
            if (args.timezoneOffset !== undefined) {
              return utcBase + (args.timezoneOffset * 60000);
            }
            return utcBase;
          }
          return new Date(s).getTime();
        };

        for (const call of otherCalls) {
          // --- Task Tool Handlers ---
          if (call.name === "addTask" || call.name === "updateTask") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taskArgs = call.args as any;

            if (call.name === "addTask") {
              await ctx.runMutation(api.ai.addTask, {
                ...taskArgs,
                dueDate: taskArgs.dueDate ? parseLocal(taskArgs.dueDate as string) : undefined,
                workspaceId,
                userId: args.userId
              });
              activeToolCall = { name: "addTask", args: call.args };
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const taskUpdates: Record<string, any> = {};
              if (taskArgs.text) taskUpdates.text = taskArgs.text;
              if (taskArgs.completed !== undefined) taskUpdates.completed = taskArgs.completed;
              if (taskArgs.priority) taskUpdates.priority = taskArgs.priority;
              if (taskArgs.category) taskUpdates.category = taskArgs.category;
              if (taskArgs.notes) taskUpdates.notes = taskArgs.notes;
              if (taskArgs.dueDate) taskUpdates.dueDate = parseLocal(taskArgs.dueDate as string);

              await ctx.runMutation(api.tasks.updateTask, {
                id: taskArgs.taskId as Id<"tasks">,
                ...taskUpdates
              });
              activeToolCall = { name: "updateTask", args: call.args };
            }
          } else if (call.name === "deleteTask") {
            const { taskId } = call.args as { taskId: string };
            await ctx.runMutation(api.tasks.deleteTask, { id: taskId as Id<"tasks"> });
            activeToolCall = { name: "deleteTask", args: call.args };
          // --- Event Tool Handlers ---
          } else if (call.name === "addEvent" || call.name === "updateEvent") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const eventArgs = call.args as any;

            if (call.name === "addEvent") {
              await ctx.runMutation(api.events.add, {
                ...eventArgs,
                startTime: parseLocal(eventArgs.startTime as string),
                endTime: parseLocal(eventArgs.endTime as string),
                workspaceId,
                userId: args.userId
              });
              activeToolCall = { name: "addEvent", args: call.args };
            } else {
              const updates: Record<string, string | number> = {};
              if (eventArgs.title) updates.title = eventArgs.title;
              if (eventArgs.location) updates.location = eventArgs.location;
              if (eventArgs.notes) updates.notes = eventArgs.notes;
              if (eventArgs.startTime) updates.startTime = parseLocal(eventArgs.startTime as string);
              if (eventArgs.endTime) updates.endTime = parseLocal(eventArgs.endTime as string);

              await ctx.runMutation(api.events.update, {
                id: eventArgs.eventId as Id<"events">,
                ...updates
              });
              activeToolCall = { name: "updateEvent", args: call.args };
            }
          } else if (call.name === "deleteEvent") {
            const { eventId } = call.args as { eventId: string };
            await ctx.runMutation(api.events.remove, { id: eventId as Id<"events"> });
            activeToolCall = { name: "deleteEvent", args: call.args };
          } else if (call.name === "updateMemory") {
            const updates = call.args as { bio: string };
            await ctx.runMutation(api.ai.updateProfile, { ...updates, userId: args.userId });
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

          if (searchCalls.length === 1) {
            activeToolCall = { name: "searchWeb", args: searchCalls[0].args };
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeToolCall = { name: "multiSearch", args: { count: searchCalls.length, queries: searchCalls.map(c => (c.args as any).query) } };
          }

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

        // 3. Ensure we have a natural text response if the AI didn't provide one
        if (!aiText && otherCalls.length > 0) {
          const confirmationPrompt = {
            contents: [
              { role: "user", parts: [{ text: prompt }] },
              { role: "model", parts: response.candidates?.[0]?.content?.parts || [] },
              { role: "user", parts: [{ text: "The action was successful. Now, confirm this to the user in your natural, conversational tone. Do not use rigid templates." }] }
            ]
          };
          const confirmResult = await model.generateContent(confirmationPrompt);
          aiText = confirmResult.response.text();
        }

        if (!aiText) {
          try {
            aiText = response.text();
          } catch {
            // Ultimate fallback - but make it dynamic
            const variations = [
              "All set! I've taken care of that for you.",
              "Done. Everything's updated as we discussed.",
              "Handled! Your workspace is synced up now.",
              "Got it sorted. You're all set to go."
            ];
            aiText = variations[Math.floor(Math.random() * variations.length)];
          }
        }
      } else {
        aiText = response.text();
      }

      // 4. Send response with toolCall info
      await ctx.runMutation(internal.messages.internalSend, {
        sessionId: args.sessionId,
        text: aiText || "I've updated your workspace with those changes.",
        author: "AI",
        toolCall: activeToolCall ? {
          name: activeToolCall.name,
          args: activeToolCall.args,
          result: { status: "success" }
        } : undefined
      });

      if (recentMessages.length % 20 === 0) {
        await ctx.scheduler.runAfter(0, internal.ai_action.reflectOnPersonality, { sessionId: args.sessionId, userId: args.userId });
      }

      // Auto-title if it's the first few messages and title is default
      if (recentMessages.length >= 1 && recentMessages.length <= 4) {
        const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId });
        if (session && session.title && (session.title.startsWith("Chat") || session.title === "New Chat")) {
          await ctx.scheduler.runAfter(0, internal.ai_action.generateSessionTitle, { sessionId: args.sessionId, userId: args.userId });
        }
      }

    } catch (error) {
      console.error("Gemini API Error Detail:", error);
      await ctx.runMutation(internal.messages.internalSend, {
        sessionId: args.sessionId,
        text: "I encountered an error while thinking. Could you try rephrasing?",
        author: "AI",
      });
    }
  },
});

export const reflectOnPersonality = internalAction({
  args: { sessionId: v.id("chatSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    // Fetch last 20 messages for more context
    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId });
    const transcript = messages.map(m => `${m.author === "User" ? "HUMAN" : "ASSISTANT"}: ${m.text}`).join("\n");

    // Fetch existing memories to avoid duplicates
    const existingMemories = await ctx.runQuery(api.ai.getAllMemories, { userId: args.userId });
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
        await ctx.runMutation(api.ai.saveMemory, { text: insight, embedding: dummyEmbedding, userId: args.userId });
        console.log("Captured new intelligence:", insight);
      }
    }
  }
});

export const generateSessionTitle = internalAction({
  args: { sessionId: v.id("chatSessions"), userId: v.id("users") },
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
export const parseDate = action({
  args: {
    text: v.string(),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    const now = new Date();
    // Server Blind: Do not adjust 'now' for the parser, let it use server UTC which matches user's local "face time" logic
    const nowISO = now.toISOString();

    const prompt = `Convert this natural language date to an ISO-8601 string. 
Current time: ${nowISO}
Input: "${args.text}"
Respond ONLY with the ISO-8601 string or "null" if invalid.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    if (responseText === "null") return null;
    return responseText;
  },
});
