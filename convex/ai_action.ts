"use node";
import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { GoogleGenerativeAI, SchemaType, Tool, Part } from "@google/generative-ai";
import mammoth from "mammoth";

async function getEmbedding(genAI: GoogleGenerativeAI, text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const embedRes = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: 768,
  } as any);
  const rawVector = embedRes.embedding.values;
  const sumSq = rawVector.reduce((sum, v) => sum + v * v, 0);
  const magnitude = Math.sqrt(sumSq);
  if (magnitude === 0) return rawVector;
  return rawVector.map(v => v / magnitude);
}

function getPeriodRange(
  type: "weekly" | "monthly" | "yearly",
  offset: number,
  timezoneOffset?: number
) {
  const now = new Date();
  if (timezoneOffset !== undefined) {
    now.setTime(now.getTime() - timezoneOffset * 60000);
  }

  const periodStart = new Date(now);
  let periodEnd = new Date(now);

  if (type === "weekly") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    periodStart.setDate(now.getDate() + diffToMonday);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setDate(periodStart.getDate() - 7 * offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "monthly") {
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setMonth(periodStart.getMonth() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodStart.getMonth() + 1);
    periodEnd.setDate(0);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "yearly") {
    periodStart.setMonth(0, 1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setFullYear(periodStart.getFullYear() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setFullYear(periodStart.getFullYear() + 1);
    periodEnd.setMonth(0, 0);
    periodEnd.setHours(23, 59, 59, 999);
  }

  let startMs = periodStart.getTime();
  let endMs = periodEnd.getTime();

  if (timezoneOffset !== undefined) {
    startMs = startMs + timezoneOffset * 60000;
    endMs = endMs + timezoneOffset * 60000;
  }

  const currentRealTimeMs = Date.now();
  if (endMs > currentRealTimeMs) {
    endMs = currentRealTimeMs;
  }

  return { startMs, endMs };
}

function getPeriodLabel(type: "weekly" | "monthly" | "yearly", startMs: number, timezoneOffset?: number) {
  const d = new Date(startMs);
  if (timezoneOffset !== undefined) {
    d.setTime(d.getTime() - timezoneOffset * 60000);
  }
  
  if (type === "weekly") {
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    return `Week of ${month} ${day}, ${year}`;
  } else if (type === "monthly") {
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  } else {
    return `${d.getFullYear()}`;
  }
}

const SKILLS_INSTRUCTION = `
## Agent Skills Reference
You are Dialogue, an advanced personal assistant operating with high intelligence and structure.

# 1. CORE PERSONA & COMMUNICATION
## Adaptive Persona (The "Friend vs Focus" Dynamic):
You must dynamically read the room and adjust your behavior based on what the user says:
- **The Friend Mode (Passive)**: If the user is venting, sharing thoughts, chatting about hobbies, or asking general questions, DO NOT talk about productivity. Be a genuine, warm, and engaging friend. Let them talk without forcing them back to work.
- **The Productivity Partner (Active)**: If the user explicitly mentions tasks, feeling overwhelmed, work, goals, or asks for planning help, shift into high gear. Be strategic, encouraging, and focused on momentum. Cleverly nudge them toward goals when appropriate.
- **Temporal Inquiries & Schedule Syncs**: When the user requests their schedule, active tasks, or triggers a Workspace Sync, you are STRICTLY FORBIDDEN from omitting active items. Adhere to the Multi-Horizon Schedule Protocol:
  * **Zero Omission for Today**: You MUST exhaustively enumerate all uncompleted tasks and calendar events scheduled for today. Lead strongly with high-priority tasks and Point-in-Time milestones.
  * **Future Horizon Summary**: For upcoming days, provide a warm, high-level summary calling out any upcoming Point-in-Time milestones.
  * **Conversational Formatting**: Present items naturally using clean bulleted or numbered lists. Use natural markdown emphasis (bold titles, italic times) without robotic bracket tags.
- **Natural Expression Mandate & Conversation Continuity**:
  * Never use rigid, repetitive, or "bot-like" sentence templates for tool confirmations. Avoid "I have added [X] to your list." Instead, weave confirmations into natural prose. Vary your tone and sentence structure constantly.
  * **No Mid-Conversation Greetings**: When confirming a tool execution or responding to tool outputs, DO NOT start your response with a greeting (e.g., "Hi", "Hello", "Halo", "Hey", "Hi [Name]"). The tool call is part of the ongoing conversation, not a new or fresh greeting phase. Simply confirm the action or answer directly.
- **Mandatory Conversational Text**: Every turn where you call a tool MUST also include a natural language part. You are forbidden from sending a tool call in isolation.
- **Multilingual Fluidity & Instant Language Matching**:
  * NEVER assume a default language or rely on the overall dominant language of the chat history.
  * You MUST dynamically match the exact language used by the user in their immediate current query (e.g., English, natural/casual Indonesian, or any other language).
  * If the user switches languages, you must switch immediately in your response to match them.
  * When calling tools, user-visible strings (titles, descriptions, notes) MUST match the language of the user's current request, while technical fields remain in standard formats.
  * **Ignore Context Language Bias**: The injected reference materials (User Name, User Personality Bio, Pending Tasks, Upcoming Events, Personality Fragments) might be written in a different language (e.g., Indonesian). You MUST ignore this language bias. The language of the user's immediate current query is the ONLY factor that dictates your response language.

# 2. WORKSPACE GOVERNANCE & HIERARCHY
- **Workspace Precedence**: The "WORKSPACE CONTEXT" provided below is your ABSOLUTE AUTHORITY. It defines your persona, goals, and rules for the current session. Prioritize these instructions over your default Adaptive Persona. Adopt any required tone (formal, strict, etc.) fully.
- **Workspace Awareness**: You always operate within a specific Workspace (Work, Personal, Side Project). Align all task suggestions and advice with the active workspace's specific goal.

# 3. VERIFICATION & EXECUTION PROTOCOL
- **Verification & Perfection Policy**: NEVER call mutation tools ('addTask', 'updateTask', 'addEvent', 'deleteTask') on the first turn. You must ensure the information gathered is perfect before execution.
- **Clarify & Confirm Before Adding**: Gather and confirm Priority, Category, Due Date/Time, Recurrence, and Notes first. Summarize the plan (e.g., "I'll schedule your weekly sync every Monday at 10:00. Sound right?") and only call the tool AFTER explicit confirmation.
- **Zero Assumption Policy**: If any detail is missing or ambiguous, ASK. Do not guess or use defaults unless the user says "you decide".
- **Task & Removal Inquiries**: If a user mentions a potential task ("I need to do X"), ask if they'd like it added. If they finish or want to remove something, ask before deleting.
- **Graceful Cancellation**: If a user declines a plan, says "never mind", or cancels, acknowledge warmly and confirm no action was taken. Do not call the tool.

# 4. DATA INTEGRITY & PRECISE TIME PARSING
- **Time Integrity Protocol**: When the user mentions a relative time, convert it to an absolute ISO-8601 string based on the "Current Time" provided below (e.g., "2026-05-15T18:00:00").
- **Military Time**: ALWAYS use 24-hour military time in your ISO-8601 strings (6:00 PM is 18:00:00).
- **Timezone Awareness**: The provided 'Current Time' is already adjusted to the user's local timezone. Do not calculate offsets.

# 5. MULTIMODAL CAPABILITIES
You are a multimodal agent capable of analyzing multiple images and documents (PDFs, Word docs, etc.).
- **Acknowledge Attachments**: If uploaded, acknowledge files naturally (e.g., "I've reviewed those 3 images").
- **Reason Across Files**: Compare documents, identify image patterns, and synthesize multi-source information simultaneously.
- **Contextual Planning**: Use file content to inform task suggestions (e.g., suggest adding calendar events from a meeting invite).

# 6. TOOL & SKILL REPERTOIRE
### addTask
- Purpose: Use ONLY AFTER verification and clarification to save a task with full metadata.
### completeTask
- Purpose: Use ONLY AFTER verification to mark a task as finished.
### deleteTask
- Purpose: Use ONLY AFTER verification to permanently remove a task.
### addEvent
- Purpose: Use ONLY AFTER verification to schedule an event.
- Event Type & Duration: For duration events (meetings, workouts), set eventType to 'interval' with startTime and endTime. For momentary events (deadlines, drops, releases), set eventType to 'point' and omit endTime.
- Recurrence: Populate 'recurrence' for repeating routines (daily/weekly). Always verify and confirm the schedule first. Set base startTime to the first occurrence.
### deleteEvent
- Purpose: Use ONLY AFTER verification to remove a scheduled event.
### updateEvent
- Purpose: Use ONLY AFTER verification to modify an existing standalone event or update ALL occurrences of an entire recurring series. Provide only the fields that need modification.
### updateEventOccurrence
- Purpose: Use ONLY AFTER verification to modify or reschedule a single day/occurrence of a recurring series (e.g., 'move Tuesday gym to 8am'). Provide seriesId and originalStartTime. Explain clearly during confirmation that ONLY this specific date was modified.
### searchWeb
- Purpose: Use to search the web for real-time info, facts, documentation, or background context.
- THE DIALOGUE VERIFICATION PRINCIPLE:
  1. You MUST call this tool immediately if the user mentions specific entities, terminology, tools, concepts, or events that are new, outside your training data, or not fully defined in your system context.
  2. If there is ANY ambiguity, uncertainty, or doubt in the user's intent, or if you lack complete/accurate context to address the query precisely, you MUST prioritize verification via searchWeb over assumption.
  3. It is always better to confirm facts and verify context first rather than responding with generic answers or potential hallucinations.
  4. You are authorized to run multiple search queries in a single turn if broad research is required to synthesize a comprehensive and highly accurate response.
### updateUserBio
- Purpose: Use ONLY when the user explicitly requests changes to their core identity, name, role, or stable communication style defaults (e.g., "From now on, call me Chief", "Always answer in a direct and blunt tone"). DO NOT use this for saving granular facts, work context, or project details.
### saveSemanticMemory
- Purpose: Use to explicitly save granular, long-term facts, technology stack preferences, work contexts, or domain-specific details learned about the user during conversation (e.g., "User is currently building a Next.js 15 app", "User prefers Tailwind CSS for styles").
### triggerReflection
- Purpose: Use to trigger a Spotify-Wrapped style periodic reflection summary of the user's tasks, events, categories, and streaks over a specific period. Use when the user asks how they are doing, requests a summary/reflection of their week/month/year, or says "How is my week going?"
- Parameters:
  * type: "weekly", "monthly", or "yearly".
  * offsetWeeks, offsetMonths, offsetYears: number (optional, default 0 for current week/month/year. Use positive numbers to look back in history).

# 7. LIVING TASK CONTEXT & BACKEND-ENFORCED JOURNALING
You maintain a "living chronological journal" on every task and event inside the 'notes' field.
This is YOUR memory per entity. You must track the evolution of user progress, emotions, and blockers over time.

- MANDATORY JOURNALING & STATUS HOOK PROTOCOL:
When updating notes via 'updateTask' or 'updateEvent', provide ONLY the raw content of your new observation (e.g., 'Progress 50%. Blocked by router config.').
DO NOT include any date, time, or bracket formatting in the note parameter. The backend server will automatically prepend the absolute system timestamp [YYYY-MM-DD HH:mm] and append it safely to the existing history.
In addition, ALWAYS synthesize a single punchy sentence into 'statusHook' describing the most current entity state for notification banners and quick UI glances.

Example Evolution:
Day 1 (May 8): User says work is halfway done but router config is tough.
You call updateTask with:
notes: "Progress 50%. Struggling with router configuration, feeling slightly frustrated."
statusHook: "Progress 50%, blocked by router config."
(Backend automatically stamps and appends: "[2026-05-08 14:00] Progress 50%...")

Day 5 (May 16): User says it's almost done and feeling excited.
You call updateTask with:
notes: "Progress 90%. Router configuration solved, ready for final testing. Feeling excited!"
statusHook: "Router configuration complete, ready for final testing (Progress 90%)."
(Backend automatically stamps and appends: "[2026-05-16 10:30] Progress 90%...")

- WHEN to update notes & statusHook:
1. During Workspace Sync: If a task has a deadline within 30 minutes and existing notes -> reference the last known context in your response, then ask for an update.
2. When user mentions progress implicitly: "Halfway done with the proposal" -> identify the relevant task, append new entry + update progress + statusHook.
3. After events conclude: Proactively ask "How did the client meeting go?" and store the outcome + statusHook.
4. When blockers are mentioned: "Can't start yet, waiting for VPN access" -> append blocker to notes + statusHook.
5. When task progress reaches 100%: When you update a task's progress to 100 (e.g. user says "I finished the research"), DO NOT call completeTask immediately. Proactively ask the user in your natural response if they would like the task officially marked as completed.

- HOW to estimate progress:
Infer naturally from conversation. NEVER ask "what percentage is completed?"
"Completed 3 out of 10 modules" -> progress: 30
"Just putting final touches" -> progress: 90
"Just started initial research" -> progress: 10
"Halfway through the tasks" -> progress: 50
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

    const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId, userId: args.userId });
    const workspaceId = session?.workspaceId;

    // 1. Fetch user profile and relevant memories via Vector Search
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId });
    const genAI = new GoogleGenerativeAI(apiKey);

    let personalityFragments = "No specific patterns learned yet.";
    try {
      const queryEmbedding = await getEmbedding(genAI, args.text);

      const searchResults = await ctx.vectorSearch("memories", "by_embedding", {
        vector: queryEmbedding,
        limit: 5,
        filter: (q) => q.eq("userId", args.userId),
      });

      if (searchResults.length > 0) {
        const matchedMemories = await Promise.all(
          searchResults.map(async (res) => {
            const doc = await ctx.runQuery(api.ai.getMemoryById, { id: res._id });
            return doc?.text;
          })
        );
        const filteredMatched = matchedMemories.filter(Boolean);
        if (filteredMatched.length > 0) {
          personalityFragments = filteredMatched.join("\n- ");
        }
      }
    } catch (err) {
      console.error("Vector search failed, falling back to chronological memories:", err);
      const memories = await ctx.runQuery(api.ai.getLatestMemories, { userId: args.userId });
      if (memories.length > 0) {
        personalityFragments = memories.map(m => m.text).join("\n- ");
      }
    }

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
    const priorityWeight: Record<string, number> = { high: 1, medium: 2, low: 3 };
    const sortedTasks = [...briefing.tasks].sort((a, b) => {
      const pA = priorityWeight[a.priority || "medium"] ?? 2;
      const pB = priorityWeight[b.priority || "medium"] ?? 2;
      if (pA !== pB) return pA - pB;
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
    const pendingTasksContext = sortedTasks.map(t => {
      const eventDate = t.dueDate ? (
        args.timezoneOffset !== undefined
          ? new Date(t.dueDate - (args.timezoneOffset * 60000))
          : new Date(t.dueDate)
      ) : null;
      const dateStr = eventDate ? ` | Due: ${eventDate.toLocaleString("en-US", { hour12: false })}` : "";
      const progressStr = t.progress !== undefined ? ` | Progress: ${t.progress}%` : "";
      const hookStr = t.statusHook ? ` | Hook: "${t.statusHook}"` : "";
      const notesStr = t.notes ? `\n  Notes:\n  ${t.notes.split("\n").join("\n  ")}` : "";
      return `- [${t._id}] ${t.text}${dateStr}${progressStr}${hookStr} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"})${notesStr}`;
    }).join("\n");

    const upcomingEvents = await ctx.runQuery(api.events.list, { workspaceId, userId: args.userId });
    const sortedEvents = upcomingEvents
      .filter(e => e.startTime > Date.now() - 3600000)
      .sort((a, b) => {
        if (a.eventType === "point" && b.eventType !== "point") return -1;
        if (b.eventType === "point" && a.eventType !== "point") return 1;
        return a.startTime - b.startTime;
      });
    const upcomingEventsContext = sortedEvents
      .map(e => {
        const eventDate = args.timezoneOffset !== undefined
          ? new Date(e.startTime - (args.timezoneOffset * 60000))
          : new Date(e.startTime);
        const hookStr = e.statusHook ? ` | Hook: "${e.statusHook}"` : "";
        const outcomeStr = e.outcome ? ` | Outcome: "${e.outcome}"` : "";
        const notesStr = e.notes ? `\n  Notes:\n  ${e.notes.split("\n").join("\n  ")}` : "";
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })}) [Type: ${e.eventType || "interval"}]${hookStr}${outcomeStr}${notesStr}`;
      })
      .join("\n");

    let briefingContext = "";
    if (args.brief) {
      briefingContext = `
      USER REQUESTED A WORKSPACE SYNC.
      Current Time: ${nowString}
      Pending Tasks: ${JSON.stringify(sortedTasks)}
      Upcoming Calendar Events: ${JSON.stringify(sortedEvents)}
      
      Provide a personalized, contextual "Sync" update. 
      - MANDATORY: Adhere to the 'Zero Omission for Today' rule. Detail today's uncompleted tasks and active events exhaustively.
      - Lead strongly with high-priority tasks and momentary milestones.
      - For upcoming days, provide a brief conversational summary.
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
            description: "CRITICAL MANDATE: DO NOT call this tool on the first turn when a user requests to add a task. You MUST ask the user to clarify and confirm the exact details (priority, category, due date) first in conversational text. Only call this tool AFTER the user explicitly says the plan is perfect.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                text: { type: SchemaType.STRING, description: "The task description" },
                dueDate: { type: SchemaType.STRING, description: "ISO-8601 due date/time (24-hour format, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                priority: { type: SchemaType.STRING, description: "Priority level: 'low', 'medium', or 'high'" },
                category: { type: SchemaType.STRING, description: "Optional category" },
                notes: { type: SchemaType.STRING, description: "Optional extra notes" },
                progress: { type: SchemaType.NUMBER, description: "Initial progress (0-100)" },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing current state" },
              },
              required: ["text"],
            },
          }, {
            name: "updateTask",
            description: "Updates an existing task. If updating context/notes, maintain chronological journal format.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to update" },
                text: { type: SchemaType.STRING, description: "Updated text" },
                completed: { type: SchemaType.BOOLEAN, description: "Whether the task is finished" },
                dueDate: { type: SchemaType.STRING, description: "Updated ISO-8601 due date (24-hour, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                priority: { type: SchemaType.STRING, description: "Updated priority: 'low', 'medium', or 'high'" },
                category: { type: SchemaType.STRING },
                notes: { type: SchemaType.STRING, description: "Chronological journal of this task's history. When updating, NEVER overwrite previous entries. Always APPEND your new update on a new line starting with today's date and time in brackets [YYYY-MM-DD HH:mm]." },
                progress: { type: SchemaType.NUMBER, description: "Estimated progress 0-100. Infer naturally from conversation — do NOT ask the user 'what percentage is completed?'" },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing the latest current state. Used directly for quick UI glances and notifications." },
              },
              required: ["taskId"],
            },
          }, {
            name: "completeTask",
            description: "Marks a task as finished/completed by its ID. CRITICAL MANDATE: When a user mentions task progress reaches 100%, DO NOT call completeTask immediately. You MUST ask the user for confirmation first in conversational text before calling this tool.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to complete" },
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
            description: "CRITICAL MANDATE: DO NOT call this tool on the first turn when a user requests to schedule an event. You MUST ask the user to clarify and confirm all details (start time, event type, recurrence) first in conversational text. Only call this tool AFTER the user explicitly confirms the plan.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING, description: "Event title" },
                description: { type: SchemaType.STRING, description: "Optional description" },
                startTime: { type: SchemaType.STRING, description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                endTime: { type: SchemaType.STRING, description: "Optional ISO-8601 end time (24-hour format). Required for interval events; omit for point events." },
                eventType: { type: SchemaType.STRING, description: "'interval' for duration events (meetings, workouts) or 'point' for momentary events (deadlines, drops, releases)." },
                location: { type: SchemaType.STRING, description: "Optional location" },
                notes: { type: SchemaType.STRING, description: "Optional notes" },
                outcome: { type: SchemaType.STRING, description: "Post-event summary or outcome" },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing current state" },
                recurrence: {
                  type: SchemaType.OBJECT,
                  description: "Optional recurrence rule if the event repeats.",
                  properties: {
                    frequency: { type: SchemaType.STRING, description: "'daily' or 'weekly'" },
                    interval: { type: SchemaType.NUMBER, description: "Interval count, e.g. 1 for every day/week, 2 for bi-weekly" },
                    daysOfWeek: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.NUMBER },
                      description: "For weekly recurrence: array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)"
                    },
                    until: { type: SchemaType.STRING, description: "Optional ISO-8601 end date for the recurrence series." }
                  },
                  required: ["frequency", "interval"]
                }
              },
              required: ["title", "startTime", "eventType"],
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
                eventType: { type: SchemaType.STRING, description: "'interval' or 'point'" },
                location: { type: SchemaType.STRING, description: "Optional new location" },
                notes: { type: SchemaType.STRING, description: "Chronological pre-event prep notes or context. Always append with timestamp [YYYY-MM-DD HH:mm]." },
                outcome: { type: SchemaType.STRING, description: "Post-event summary: decisions made, action items, key takeaways. Updated after the event concludes." },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing the event status or prep state for quick UI glances and notifications." },
                recurrence: {
                  type: SchemaType.OBJECT,
                  description: "Optional updated recurrence rule.",
                  properties: {
                    frequency: { type: SchemaType.STRING, description: "'daily' or 'weekly'" },
                    interval: { type: SchemaType.NUMBER },
                    daysOfWeek: { type: SchemaType.ARRAY, items: { type: SchemaType.NUMBER } },
                    until: { type: SchemaType.STRING }
                  },
                  required: ["frequency", "interval"]
                }
              },
              required: ["eventId"],
            },
          },
          {
            name: "updateEventOccurrence",
            description: "Modifies or reschedules a single detached occurrence of a recurring event series (e.g. moving just this Tuesday's workout to 8am).",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                seriesId: { type: SchemaType.STRING, description: "The ID of the parent recurring event series" },
                originalStartTime: { type: SchemaType.STRING, description: "ISO-8601 timestamp of the specific occurrence being modified (e.g. '2026-05-19T07:00:00')" },
                startTime: { type: SchemaType.STRING, description: "Optional new ISO-8601 start time for this single occurrence" },
                endTime: { type: SchemaType.STRING, description: "Optional new ISO-8601 end time for this single occurrence" },
                eventType: { type: SchemaType.STRING, description: "Optional new event type ('interval' or 'point')" },
                title: { type: SchemaType.STRING, description: "Optional new title for this occurrence" },
                location: { type: SchemaType.STRING, description: "Optional new location for this occurrence" },
              },
              required: ["seriesId", "originalStartTime"],
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
            name: "updateUserBio",
            description: "Updates the core user profile bio/personality summary and preferences.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                bio: { type: SchemaType.STRING, description: "The updated bio/personality summary" },
              },
              required: ["bio"],
            },
          },
          {
            name: "saveSemanticMemory",
            description: "Saves a granular, long-term semantic memory/fact about the user (e.g., technical preferences, project details).",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                text: { type: SchemaType.STRING, description: "The granular fact or preference to remember" },
              },
              required: ["text"],
            },
          },
          {
            name: "triggerReflection",
            description: "Triggers a periodic reflection (Spotify Wrapped style) for the user to summarize tasks completed, events attended, streaks, etc. Can be weekly, monthly, or yearly.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                type: { type: SchemaType.STRING, description: "Type of reflection: 'weekly', 'monthly', or 'yearly'" },
                offsetWeeks: { type: SchemaType.NUMBER, description: "Offset weeks to look back (default 0 for current week)" },
                offsetMonths: { type: SchemaType.NUMBER, description: "Offset months to look back (default 0)" },
                offsetYears: { type: SchemaType.NUMBER, description: "Offset years to look back (default 0)" },
              },
              required: ["type"],
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
      const recentMessages = await ctx.runQuery(api.messages.list, {
        sessionId: args.sessionId,
        userId: args.userId
      });
      const transcript = recentMessages
        .filter(m => m._id !== args.messageId)
        .slice(-20)
        .map((msg) => {
          const attachmentContext = (msg.attachments || [])
            .map(a => `[File: ${a.fileName}${a.extractedText ? ` (Content: ${a.extractedText.substring(0, 500)}...)` : ""}]`)
            .join(" ");
          return `${msg.author}: ${attachmentContext ? attachmentContext + " " : ""}${msg.text}`;
        })
        .join("\n");

      let aiText = "";
      let reflectionSummaryText: string | undefined = undefined;
      const activeToolCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        result?: Record<string, unknown>;
      }> = [];

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
      let result;
      try {
        result = await model.generateContent(promptParts);
      } catch (err) {
        const error = err as { status?: number; message?: string };
        if (error?.status === 429 || error?.message?.includes("429")) {
          console.error("Gemini Rate Limit Hit:", err);
          await ctx.runMutation(internal.messages.internalSend, {
            sessionId: args.sessionId,
            text: "Waduh, sepertinya saya sedang menerima terlalu banyak permintaan (Rate Limit). Coba lagi dalam beberapa saat ya! 🙏",
            author: "AI",
          });
          return;
        }
        throw err;
      }
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

        const executedActionSummaries: { name: string; summary: string }[] = [];

        for (const call of otherCalls) {
          // --- Task Tool Handlers ---
          if (call.name === "addTask" || call.name === "updateTask") {
            const taskArgs = call.args as {
              taskId?: string;
              text?: string;
              completed?: boolean;
              dueDate?: string;
              priority?: "low" | "medium" | "high";
              category?: string;
              notes?: string;
              progress?: number;
              statusHook?: string;
            };

            if (call.name === "addTask") {
              await ctx.runMutation(api.ai.addTask, {
                text: taskArgs.text!,
                priority: taskArgs.priority,
                category: taskArgs.category,
                notes: taskArgs.notes,
                progress: taskArgs.progress,
                statusHook: taskArgs.statusHook,
                dueDate: taskArgs.dueDate ? parseLocal(taskArgs.dueDate) : undefined,
                workspaceId,
                userId: args.userId
              });
              executedActionSummaries.push({
                name: "addTask",
                summary: `Created new task '${taskArgs.text}'`
              });
              activeToolCalls.push({ name: "addTask", args: call.args as Record<string, unknown>, result: { status: "success" } });
            } else {
              const oldTask = await ctx.runQuery(api.tasks.get, { id: taskArgs.taskId as Id<"tasks">, userId: args.userId });

              const taskUpdates: Record<string, string | boolean | number | undefined> = {};
              if (taskArgs.text) taskUpdates.text = taskArgs.text;
              if (taskArgs.completed !== undefined) taskUpdates.completed = taskArgs.completed;
              if (taskArgs.priority) taskUpdates.priority = taskArgs.priority;
              if (taskArgs.category) taskUpdates.category = taskArgs.category;
              if (taskArgs.notes) taskUpdates.notes = taskArgs.notes;
              if (taskArgs.progress !== undefined) taskUpdates.progress = taskArgs.progress;
              if (taskArgs.statusHook !== undefined) taskUpdates.statusHook = taskArgs.statusHook;
              if (taskArgs.dueDate) taskUpdates.dueDate = parseLocal(taskArgs.dueDate);

              await ctx.runMutation(api.tasks.updateTask, {
                id: taskArgs.taskId! as Id<"tasks">,
                userId: args.userId,
                timezoneOffset: args.timezoneOffset,
                ...taskUpdates
              });

              executedActionSummaries.push({
                name: "updateTask",
                summary: `Updated task '${oldTask?.text}'`
              });

              const isOnlyContext = Object.keys(call.args).every(k => ["taskId", "notes", "progress", "statusHook"].includes(k)) && Object.keys(call.args).some(k => ["notes", "progress", "statusHook"].includes(k));

              if (!isOnlyContext) {
                activeToolCalls.push({
                  name: "updateTask",
                  args: {
                    ...call.args as Record<string, unknown>,
                    titleHint: oldTask?.text,
                    oldValues: oldTask ? {
                      priority: oldTask.priority,
                      category: oldTask.category,
                      dueDate: oldTask.dueDate,
                      text: oldTask.text,
                      completed: oldTask.completed
                    } : undefined
                  },
                  result: { status: "success" }
                });
              }
            }
          } else if (call.name === "deleteTask") {
            const { taskId } = call.args as { taskId: string };
            const task = await ctx.runQuery(api.tasks.get, { id: taskId as Id<"tasks">, userId: args.userId });
            await ctx.runMutation(api.tasks.deleteTask, { id: taskId as Id<"tasks">, userId: args.userId });
            executedActionSummaries.push({
              name: "deleteTask",
              summary: `Deleted task '${task?.text}'`
            });
            activeToolCalls.push({ name: "deleteTask", args: { ...call.args as Record<string, unknown>, titleHint: task?.text }, result: { status: "success" } });
          } else if (call.name === "completeTask") {
            const { taskId } = call.args as { taskId: string };
            const task = await ctx.runQuery(api.tasks.get, { id: taskId as Id<"tasks">, userId: args.userId });
            await ctx.runMutation(api.tasks.completeTask, { id: taskId as Id<"tasks">, userId: args.userId });
            executedActionSummaries.push({
              name: "completeTask",
              summary: `Completed task '${task?.text}'`
            });
            activeToolCalls.push({ name: "completeTask", args: { ...call.args as Record<string, unknown>, titleHint: task?.text }, result: { status: "success" } });
            // --- Event Tool Handlers ---
          } else if (call.name === "addEvent" || call.name === "updateEvent") {
            const eventArgs = call.args as {
              eventId?: string;
              title?: string;
              location?: string;
              notes?: string;
              outcome?: string;
              statusHook?: string;
              startTime?: string;
              endTime?: string;
              eventType?: "interval" | "point";
              recurrence?: {
                frequency: "daily" | "weekly";
                interval: number;
                daysOfWeek?: number[];
                until?: string;
              };
            };

            if (call.name === "addEvent") {
              const recurrence = eventArgs.recurrence ? {
                frequency: eventArgs.recurrence.frequency,
                interval: eventArgs.recurrence.interval,
                daysOfWeek: eventArgs.recurrence.daysOfWeek,
                until: eventArgs.recurrence.until ? parseLocal(eventArgs.recurrence.until) : undefined,
              } : undefined;

              await ctx.runMutation(api.events.add, {
                title: eventArgs.title!,
                location: eventArgs.location,
                notes: eventArgs.notes,
                outcome: eventArgs.outcome,
                statusHook: eventArgs.statusHook,
                startTime: parseLocal(eventArgs.startTime!),
                endTime: eventArgs.endTime ? parseLocal(eventArgs.endTime) : undefined,
                eventType: eventArgs.eventType || (eventArgs.endTime ? "interval" : "point"),
                recurrence,
                workspaceId,
                userId: args.userId
              });
              executedActionSummaries.push({
                name: "addEvent",
                summary: `Scheduled new event '${eventArgs.title}' starting at ${eventArgs.startTime}`
              });
              activeToolCalls.push({ name: "addEvent", args: call.args as Record<string, unknown>, result: { status: "success" } });
            } else {
              const oldEvent = await ctx.runQuery(api.events.get, { id: eventArgs.eventId as Id<"events">, userId: args.userId });

              const updates: Record<string, unknown> = {};
              if (eventArgs.title) updates.title = eventArgs.title;
              if (eventArgs.location) updates.location = eventArgs.location;
              if (eventArgs.notes) updates.notes = eventArgs.notes;
              if (eventArgs.outcome) updates.outcome = eventArgs.outcome;
              if (eventArgs.statusHook) updates.statusHook = eventArgs.statusHook;
              if (eventArgs.startTime) updates.startTime = parseLocal(eventArgs.startTime);
              if (eventArgs.endTime) updates.endTime = parseLocal(eventArgs.endTime);
              if (eventArgs.eventType) updates.eventType = eventArgs.eventType;
              if (eventArgs.recurrence) {
                updates.recurrence = {
                  frequency: eventArgs.recurrence.frequency,
                  interval: eventArgs.recurrence.interval,
                  daysOfWeek: eventArgs.recurrence.daysOfWeek,
                  until: eventArgs.recurrence.until ? parseLocal(eventArgs.recurrence.until) : undefined,
                };
              }

              await ctx.runMutation(api.events.update, {
                id: eventArgs.eventId! as Id<"events">,
                userId: args.userId,
                timezoneOffset: args.timezoneOffset,
                ...updates
              });

              executedActionSummaries.push({
                name: "updateEvent",
                summary: `Updated entire event or recurring series '${oldEvent?.title}'. Modifications applied to all occurrences in the series.`
              });

              const isOnlyContext = Object.keys(call.args).every(k => ["eventId", "notes", "outcome", "statusHook"].includes(k)) && Object.keys(call.args).some(k => ["notes", "outcome", "statusHook"].includes(k));

              if (!isOnlyContext) {
                activeToolCalls.push({
                  name: "updateEvent",
                  args: {
                    ...call.args as Record<string, unknown>,
                    titleHint: oldEvent?.title,
                    oldValues: oldEvent ? {
                      title: oldEvent.title,
                      startTime: oldEvent.startTime,
                      endTime: oldEvent.endTime,
                      location: oldEvent.location,
                    } : undefined
                  },
                  result: { status: "success" }
                });
              }
            }
          } else if (call.name === "deleteEvent") {
            const { eventId } = call.args as { eventId: string };
            const event = await ctx.runQuery(api.events.get, { id: eventId as Id<"events">, userId: args.userId });
            await ctx.runMutation(api.events.remove, { id: eventId as Id<"events">, userId: args.userId });
            executedActionSummaries.push({
              name: "deleteEvent",
              summary: `Deleted event or entire recurring series '${event?.title}'.`
            });
            activeToolCalls.push({ name: "deleteEvent", args: { ...call.args as Record<string, unknown>, titleHint: event?.title }, result: { status: "success" } });
          } else if (call.name === "updateEventOccurrence") {
            const occArgs = call.args as { seriesId: string; originalStartTime: string; startTime?: string; endTime?: string; eventType?: "interval" | "point"; title?: string; location?: string };
            const oldEvent = await ctx.runQuery(api.events.get, { id: occArgs.seriesId as Id<"events">, userId: args.userId });
            await ctx.runMutation(api.events.updateOccurrence, {
              seriesId: occArgs.seriesId as Id<"events">,
              userId: args.userId,
              originalStartTime: parseLocal(occArgs.originalStartTime),
              startTime: occArgs.startTime ? parseLocal(occArgs.startTime) : undefined,
              endTime: occArgs.endTime ? parseLocal(occArgs.endTime) : undefined,
              eventType: occArgs.eventType,
              title: occArgs.title,
              location: occArgs.location,
            });
            executedActionSummaries.push({
              name: "updateEventOccurrence",
              summary: `Successfully modified only the single occurrence on ${occArgs.originalStartTime} for recurring event series '${oldEvent?.title}'. New details for this single day: startTime=${occArgs.startTime || occArgs.originalStartTime}, title=${occArgs.title || oldEvent?.title}. NOTE: Added exception to parent series so it skips this date, and created a standalone event specifically for this date. The rest of the recurring schedule remains completely unchanged.`
            });
            activeToolCalls.push({
              name: "updateEventOccurrence",
              args: {
                ...call.args as Record<string, unknown>,
                titleHint: occArgs.title ?? oldEvent?.title,
              },
              result: { status: "success" }
            });
          } else if (call.name === "updateUserBio") {
            const updates = call.args as { bio: string };
            const oldProfile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId });
            await ctx.runMutation(api.ai.updateProfile, { ...updates, userId: args.userId });
            executedActionSummaries.push({
              name: "updateUserBio",
              summary: `Updated user profile/memory bio.`
            });
            activeToolCalls.push({
              name: "updateUserBio",
              args: {
                ...call.args as Record<string, unknown>,
                oldBio: oldProfile?.bio
              },
              result: { status: "success" }
            });
          } else if (call.name === "saveSemanticMemory") {
            const { text } = call.args as { text: string };
            const realEmbedding = await getEmbedding(genAI, text);
            await ctx.runMutation(api.ai.saveMemory, { text, embedding: realEmbedding, userId: args.userId });
            executedActionSummaries.push({
              name: "saveSemanticMemory",
              summary: `Saved a new granular semantic memory: "${text}"`
            });
            activeToolCalls.push({
              name: "saveSemanticMemory",
              args: call.args as Record<string, unknown>,
              result: { status: "success" }
            });
          } else if (call.name === "triggerReflection") {
            const reflArgs = call.args as {
              type: "weekly" | "monthly" | "yearly";
              offsetWeeks?: number;
              offsetMonths?: number;
              offsetYears?: number;
            };

            const type = reflArgs.type;
            const offset = type === "weekly"
              ? (reflArgs.offsetWeeks ?? 0)
              : type === "monthly"
                ? (reflArgs.offsetMonths ?? 0)
                : (reflArgs.offsetYears ?? 0);

            const { startMs, endMs } = getPeriodRange(type, offset, args.timezoneOffset);
            const periodLabel = getPeriodLabel(type, startMs, args.timezoneOffset);

            const stats = await ctx.runQuery(api.reflections.compileReflectionStats, {
              workspaceId,
              type,
              periodStart: startMs,
              periodEnd: endMs,
              userId: args.userId
            });

            if (stats) {
              const summaryModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
              const statsText = `
                Type: ${type}
                Period: ${periodLabel}
                Tasks Completed: ${stats.tasksCompleted}
                Tasks Created: ${stats.tasksCreated}
                Events Attended: ${stats.eventsAttended}
                Top Categories: ${stats.topCategories?.join(", ") || "None"}
                Streak Days: ${stats.streakDays || 0}
                
                ${stats.subSummaries ? `SUB-PERIOD SUMMARIES:\n${stats.subSummaries}` : ""}
                ${stats.rawDetails ? `RAW LOGS:\n${stats.rawDetails}` : ""}
              `;

              const summaryPrompt = `
                You are Dialogue, a productivity companion.
                Create a high-fidelity, Spotify-Wrapped style periodic reflection summary.
                Keep it highly engaging, celebratory, motivating, but honest.
                Use bullet points, emojis, bold text, and highlights.
                Draw connections between tasks and events if possible.
                Address the user by name: "${profile?.name || "User"}".
                
                Stats data:
                ${statsText}
                
                CRITICAL INSTRUCTION:
                1. Make it feel extremely personalized and premium.
                2. Write the ENTIRE reflection summary, all bullet points, and the concluding question in the same language as the user's query: "${args.text.replace(/"/g, '\\"')}".
                   - Detect the language of the user's query (e.g., English, Indonesian, Japanese, or any other language).
                   - You MUST translate and write everything (headings, stats summaries, list items, and the concluding question) in that exact query language.
                   - Ignore the language of the source tasks or events in the Stats data (which may be in Indonesian). The query's language is the ONLY language allowed for the output.
                3. Conclude with a single open-ended question in that query language inviting the user's feedback/reflection on their progress (e.g., "How do you feel about this week's progress?"). Do NOT output any internal formatting, instructions, or robotic tags.
              `;

              const summaryRes = await summaryModel.generateContent(summaryPrompt);
              const summaryText = summaryRes.response.text();
              reflectionSummaryText = summaryText;

              const reflectionId = await ctx.runMutation(api.reflections.saveReflection, {
                workspaceId,
                type,
                periodStart: startMs,
                periodEnd: endMs,
                periodLabel,
                summary: summaryText,
                stats: {
                  tasksCompleted: stats.tasksCompleted,
                  tasksCreated: stats.tasksCreated,
                  eventsAttended: stats.eventsAttended,
                  topCategories: stats.topCategories || [],
                  streakDays: stats.streakDays,
                },
                userId: args.userId,
              });

              executedActionSummaries.push({
                name: "triggerReflection",
                summary: `Generated and saved a ${type} reflection for ${periodLabel}`
              });

              activeToolCalls.push({
                name: "triggerReflection",
                args: call.args as Record<string, unknown>,
                result: {
                  status: "success",
                  reflectionId,
                  type,
                  periodLabel,
                  summary: summaryText,
                  stats: {
                    tasksCompleted: stats.tasksCompleted,
                    tasksCreated: stats.tasksCreated,
                    eventsAttended: stats.eventsAttended,
                    topCategories: stats.topCategories || [],
                    streakDays: stats.streakDays,
                  }
                }
              });
            }
          }
        }

        if (searchCalls.length > 0) {
          const tavilyKey = process.env.TAVILY_API_KEY;
          const serperKey = process.env.SERPER_API_KEY;
          const searchProvider = (profile?.preferences as { searchProvider?: string })?.searchProvider || "tavily";

          const searchResults = await Promise.all(searchCalls.map(async (call) => {
            const { query } = call.args as { query: string };
            let content = "Search failed.";
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            if (searchProvider === "serper" && serperKey) {
              try {
                const serperRes = await fetch("https://google.serper.dev/search", {
                  method: "POST",
                  headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
                  body: JSON.stringify({ q: query }),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const serperData = await serperRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content = serperData.organic ? serperData.organic.map((r: any) => r.snippet).join("\n") : "No results found.";
              } catch (err: unknown) {
                clearTimeout(timeoutId);
                content = err instanceof Error && err.name === "AbortError" ? `Search timed out for "${query}"` : `Error searching Serper for "${query}"`;
              }
            } else if (tavilyKey) {
              try {
                const tvlyRes = await fetch("https://api.tavily.com/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ api_key: tavilyKey, query, include_answer: true }),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const tvlyData = await tvlyRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content = tvlyData.answer || (tvlyData.results ? tvlyData.results.map((r: any) => r.content).join("\n") : "No results found.");
              } catch (err: unknown) {
                clearTimeout(timeoutId);
                content = err instanceof Error && err.name === "AbortError" ? `Search timed out for "${query}"` : `Error searching Tavily for "${query}"`;
              }
            }
            return { name: "searchWeb", response: { result: content } };
          }));

          if (searchCalls.length === 1) {
            activeToolCalls.push({ name: "searchWeb", args: searchCalls[0].args as Record<string, unknown>, result: { status: "success" } });
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeToolCalls.push({ name: "multiSearch", args: { count: searchCalls.length, queries: searchCalls.map(c => (c.args as any).query) }, result: { status: "success" } });
          }

          const modelParts = (response.candidates?.[0]?.content?.parts || []).filter(p => p.functionCall);

          const feedbackPrompt = {
            contents: [
              { role: "user", parts: [{ text: prompt }] },
              { role: "model", parts: modelParts },
              { role: "user", parts: searchResults.map(res => ({ functionResponse: res })) }
            ]
          };
          const finalResult = await model.generateContent(feedbackPrompt);
          aiText = finalResult.response.text();
        }

        // 3. Ensure we have an accurate, natural text response reflecting actual database execution
        if (executedActionSummaries.length > 0) {
          const modelParts = (response.candidates?.[0]?.content?.parts || []).filter(p => p.functionCall);

          const confirmationPrompt = {
            contents: [
              { role: "user", parts: [{ text: prompt }] },
              { role: "model", parts: modelParts },
              {
                role: "user",
                parts: [
                  ...executedActionSummaries.map(s => ({
                    functionResponse: {
                      name: s.name,
                      response: { status: "success", executionDetails: s.summary }
                    }
                  })),
                  { text: "The requested actions were successfully executed in the database. Now, output ONLY your natural, conversational confirmation addressed directly to the user, using the EXACT same language the user used in their query. CRITICAL: Do NOT repeat or output any internal prompt instructions, scratchpad notes, or thought processes. If you modified a single occurrence of a recurring event (updateEventOccurrence), clearly state that ONLY that specific day's event was modified/rescheduled, while the rest of the routine schedule remains exactly the same." }
                ]
              }
            ]
          };
          const confirmResult = await model.generateContent(confirmationPrompt);
          aiText = confirmResult.response.text();
        }

        if (reflectionSummaryText) {
          aiText = reflectionSummaryText;
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

      if (aiText) {
        aiText = aiText
          .replace(/^(?:DO NOT|CRITICAL|NOTE|IMPORTANT|INSTRUCTION|RULE|SYSTEM|MANDATORY):?.*\n+/gi, "")
          .trim();
        if (/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/.test(aiText)) {
          aiText = aiText.replace(/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/, "").trim();
        }
      }

      // 4. Send response with toolCall info
      await ctx.runMutation(internal.messages.internalSend, {
        sessionId: args.sessionId,
        text: aiText || "I've updated your workspace with those changes.",
        author: "AI",
        toolCall: activeToolCalls.length > 0 ? {
          name: activeToolCalls[0].name,
          args: activeToolCalls[0].args,
          result: activeToolCalls[0].result ?? { status: "success" }
        } : undefined,
        toolCalls: activeToolCalls.length > 0 ? activeToolCalls.map(c => ({
          name: c.name,
          args: c.args,
          result: c.result ?? { status: "success" }
        })) : undefined
      });

      // Dynamic reflection is disabled under Option A (AI-driven explicit saving via saveSemanticMemory).

      // Auto-title if it's the first few messages and title is default
      if (recentMessages.length >= 1 && recentMessages.length <= 4) {
        const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId, userId: args.userId });
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
    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId, userId: args.userId });
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
        const realEmbedding = await getEmbedding(genAI, insight);
        await ctx.runMutation(api.ai.saveMemory, { text: insight, embedding: realEmbedding, userId: args.userId });
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

    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId, userId: args.userId });
    if (!messages || messages.length === 0) return;

    const transcript = messages.map(m => `${m.author}: ${m.text}`).join("\n");

    const prompt = `Based on the following conversation transcript, detect the primary language used and generate a very short, creative, and descriptive title in that exact same language (maximum 3-4 words). Output ONLY the title without any introductory text.
    Do not use quotes, punctuation, or special characters.
    Transcript:
    ${transcript}`;

    const result = await model.generateContent(prompt);
    const title = result.response.text().trim().replace(/["']/g, '');

    if (title && title.length > 2) {
      await ctx.runMutation(internal.messages.updateSessionTitle, { id: args.sessionId, title, userId: args.userId });
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
    if (args.timezoneOffset !== undefined) {
      now.setMinutes(now.getMinutes() - args.timezoneOffset);
    }
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

export const saveSemanticMemoryAction = action({
  args: { text: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const genAI = new GoogleGenerativeAI(apiKey);
    const embedding = await getEmbedding(genAI, args.text);
    await ctx.runMutation(api.ai.saveMemory, { text: args.text, embedding, userId: args.userId });
  }
});

export const generateCronReflection = internalAction({
  args: {
    userId: v.id("users"),
    sessionId: v.id("chatSessions"),
    type: v.union(v.literal("weekly"), v.literal("monthly")),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId });
    
    const recentMessages = await ctx.runQuery(api.messages.list, {
      sessionId: args.sessionId,
      userId: args.userId
    });
    const lastUserText = recentMessages.slice().reverse().find(m => m.author === "User")?.text || "Hello";
    const lastMsgWithTz = recentMessages.slice().reverse().find(m => m.timezoneOffset !== undefined);
    const timezoneOffset = lastMsgWithTz?.timezoneOffset ?? 0;

    const offset = args.type === "monthly" ? 1 : 0;
    
    const { startMs, endMs } = getPeriodRange(args.type, offset, timezoneOffset);
    const periodLabel = getPeriodLabel(args.type, startMs, timezoneOffset);

    const stats = await ctx.runQuery(api.reflections.compileReflectionStats, {
      type: args.type,
      periodStart: startMs,
      periodEnd: endMs,
      userId: args.userId
    });

    if (!stats) return;

    const summaryModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
    const statsText = `
      Type: ${args.type}
      Period: ${periodLabel}
      Tasks Completed: ${stats.tasksCompleted}
      Tasks Created: ${stats.tasksCreated}
      Events Attended: ${stats.eventsAttended}
      Top Categories: ${stats.topCategories?.join(", ") || "None"}
      Streak Days: ${stats.streakDays || 0}
      
      ${stats.subSummaries ? `SUB-PERIOD SUMMARIES:\n${stats.subSummaries}` : ""}
      ${stats.rawDetails ? `RAW LOGS:\n${stats.rawDetails}` : ""}
    `;

    const summaryPrompt = `
      You are Dialogue, a productivity companion.
      Create a high-fidelity, Spotify-Wrapped style periodic reflection summary.
      Keep it highly engaging, celebratory, motivating, but honest.
      Use bullet points, emojis, bold text, and highlights.
      Draw connections between tasks and events if possible.
      Address the user by name: "${profile?.name || "User"}".
      
      Stats data:
      ${statsText}
      
      CRITICAL INSTRUCTION:
      1. Make it feel extremely personalized and premium.
      2. Write the ENTIRE reflection summary, all bullet points, and the concluding question in the same language as the user's last message: "${lastUserText.replace(/"/g, '\\"')}".
         - Detect the language of the user's last message (e.g., English, Indonesian, Japanese, or any other language).
         - You MUST translate and write everything (headings, stats summaries, list items, and the concluding question) in that exact query language.
         - Ignore the language of the source tasks or events in the Stats data (which may be in Indonesian). The last message's language is the ONLY language allowed for the output.
      3. Conclude with a single open-ended question in that query language inviting the user's feedback/reflection on their progress (e.g., "How do you feel about this week's progress?"). Do NOT output any internal formatting, instructions, or robotic tags.
    `;

    const summaryRes = await summaryModel.generateContent(summaryPrompt);
    const summaryText = summaryRes.response.text();

    const reflectionId = await ctx.runMutation(api.reflections.saveReflection, {
      type: args.type,
      periodStart: startMs,
      periodEnd: endMs,
      periodLabel,
      summary: summaryText,
      stats: {
        tasksCompleted: stats.tasksCompleted,
        tasksCreated: stats.tasksCreated,
        eventsAttended: stats.eventsAttended,
        topCategories: stats.topCategories || [],
        streakDays: stats.streakDays,
      },
      userId: args.userId,
    });

    await ctx.runMutation(internal.messages.internalSend, {
      sessionId: args.sessionId,
      text: summaryText,
      author: "AI",
      toolCall: {
        name: "triggerReflection",
        args: { type: args.type, offsetWeeks: args.type === "weekly" ? 0 : 0, offsetMonths: args.type === "monthly" ? 1 : 0 },
        result: {
          status: "success",
          reflectionId,
          type: args.type,
          periodLabel,
          summary: summaryText,
          stats: {
            tasksCompleted: stats.tasksCompleted,
            tasksCreated: stats.tasksCreated,
            eventsAttended: stats.eventsAttended,
            topCategories: stats.topCategories || [],
            streakDays: stats.streakDays,
          }
        }
      },
      toolCalls: [
        {
          name: "triggerReflection",
          args: { type: args.type, offsetWeeks: args.type === "weekly" ? 0 : 0, offsetMonths: args.type === "monthly" ? 1 : 0 },
          result: {
            status: "success",
            reflectionId,
            type: args.type,
            periodLabel,
            summary: summaryText,
            stats: {
              tasksCompleted: stats.tasksCompleted,
              tasksCreated: stats.tasksCreated,
              eventsAttended: stats.eventsAttended,
              topCategories: stats.topCategories || [],
              streakDays: stats.streakDays,
            }
          }
        }
      ]
    });
  }
});
