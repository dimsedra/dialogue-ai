"use node";
import { internalAction, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { GoogleGenerativeAI, SchemaType, Tool, Part } from "@google/generative-ai";
import mammoth from "mammoth";
import { runChatEngine, executeChatFollowUp, PROVIDER_CAPABILITIES, runSimpleTask } from "./ai_providers";

function isMultimodalProvider(provider: string): boolean {
  return PROVIDER_CAPABILITIES[provider]?.multimodal ?? false;
}

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

// Helper function to hash text using Web Crypto SHA-256
async function computeHash(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function saveSemanticMemoryInternal(
  ctx: ActionCtx,
  genAI: GoogleGenerativeAI,
  text: string,
  userId?: Id<"users">
): Promise<{ status: "inserted" | "updated" | "skipped_duplicate"; id?: string }> {
  const profile = await ctx.runQuery(api.ai.getProfile, { userId, revealKeys: true });
  const resolvedUserId = userId ?? profile?.userId;
  if (!resolvedUserId) throw new Error("Unauthorized");

  const hash = await computeHash(text);

  // 1. Check if duplicate hash exists
  const existingMemory = await ctx.runQuery(api.ai.getMemoryByHash, { hash, userId: resolvedUserId });
  if (existingMemory) {
    console.log(`Duplicate memory hash found: ${hash}. Updating timestamp.`);
    const embedding = await getEmbedding(genAI, text);
    await ctx.runMutation(api.ai.saveMemory, {
      text,
      embedding,
      userId: resolvedUserId,
      hash,
      updatedAt: Date.now(),
    });
    return { status: "updated", id: existingMemory._id };
  }

  const embedding = await getEmbedding(genAI, text);

  // 2. Semantic write guard: check if any existing memory has cosine similarity > 0.85
  const searchResults = await ctx.vectorSearch("memories", "by_embedding", {
    vector: embedding,
    limit: 1,
    filter: (q) => q.eq("userId", resolvedUserId),
  });

  if (searchResults.length > 0) {
    const topMatch = searchResults[0];
    if (topMatch._score > 0.85) {
      console.log(`Semantic duplicate detected (similarity score: ${topMatch._score} > 0.85). Skipping save.`);
      return { status: "skipped_duplicate" };
    }
  }

  // 3. Save new memory
  const id = await ctx.runMutation(api.ai.saveMemory, {
    text,
    embedding,
    userId: resolvedUserId,
    hash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { status: "inserted", id };
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

# 1. CORE PERSONA & COMMUNICATION
## Relational Behaviors
- **Proactive recall**: Reference what the user has shared before (from memories, notes, past events) without being asked.
- **Follow-up**: When user mentioned a pending outcome ("I have a call", "working on X"), check back on it naturally in this session or the next.
- **Honest framing**: If uncertain, say so. Never fake familiarity.
- **Graceful retreat**: If the user declines or changes topic, drop it with zero persistence.
- **Thread continuity**: Acknowledge what came before in the structure of your response.

## Adaptive Persona (The "Friend vs Focus" Dynamic):
Your User Personality Bio and active Workspace Context define your tone and refine how you execute these modes. When they specify a style, tone, or behavior rule, defer to them.
You must dynamically read the room and adjust your behavior based on what the user says:
- **The Friend Mode (Passive)**: If the user is venting, sharing thoughts, chatting about hobbies, or asking general questions, DO NOT talk about productivity. Match their conversational register and focus on the shared moment. Let them talk without forcing them back to work.
- **The Productivity Partner (Active)**: If the user explicitly mentions tasks, feeling overwhelmed, work, goals, or asks for planning help, shift into high gear. Be strategic and focused on momentum. Gently steer toward goals only when it fits the flow.
- **Temporal Inquiries & Schedule Syncs**: When the user requests their schedule, active tasks, or triggers a Workspace Sync, you are STRICTLY FORBIDDEN from omitting active items. Adhere to the Multi-Horizon Schedule Protocol:
  * **Zero Omission for Today**: You MUST exhaustively enumerate all uncompleted tasks and calendar events scheduled for today. Lead strongly with high-priority tasks and Point-in-Time milestones.
  * **Future Horizon Summary**: For upcoming days, provide a concise, high-level summary calling out any upcoming Point-in-Time milestones.
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
- **MANDATORY — Step-by-Step Collection**: When creating a task or event, you MUST ask ONE field per turn. Never dump all questions at once. After the user answers a field, confirm briefly and proceed to the next missing field. Do NOT create the task/event until all fields the user cares about have been answered.
- **Create Immediately After Last Field**: Once all relevant fields are collected — or the user says "that's enough" — call the tool immediately. No final "plan summary" or extra confirmation step required.
- **Bulk Exemption**: When using \`batchAddTasks\` (multiple items), skip step-by-step entirely — create all tasks directly in one call.
- **If user already gave all details**: Briefly confirm and call the tool in the same turn. Do not artificially loop through fields.
- **Zero Assumption Policy**: If any detail is missing or ambiguous, ASK. Do not guess or use defaults unless the user says "you decide".
- **Task & Removal Inquiries**: If a user mentions a potential task ("I need to do X"), ask if they'd like it added. If they finish or want to remove something, ask before deleting.
- **Graceful Cancellation**: If a user declines a plan, says "never mind", or cancels, acknowledge naturally and confirm no action was taken. Do not call the tool.
- **Memory Storage Exemption**: The memory saving tools (\`saveSemanticMemory\` and \`updateUserBio\`) are strictly EXEMPT from these rules. You MUST call them silently and immediately on the first turn when a relevant personal fact is shared. Do NOT ask the user for confirmation to save a memory.
- **URL Fidelity Protocol**: When the user shares a URL or asks about content behind a link, you MUST call fetchUrl on that URL before answering. NEVER describe, summarize, or paraphrase what you think is at a URL without fetching it first — guessing causes hallucinations. If fetchUrl returns empty or an error, say "I couldn't read that page" — do not guess. This protocol overrides any general knowledge you may have about the domain or site. Always fetch, never assume.

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
- Purpose: Ask ONE field per turn (priority, category, due date, notes). Do NOT create the task until the user has answered all the fields they care about. Call the tool immediately after the last field — no final "summary" confirmation.
- **Anti-pattern**: "I'll create Q2 Planning. Would you like to set a priority or due date?" — This is WRONG. You must ask one field at a time BEFORE creating.
### completeTask
- Purpose: Use ONLY AFTER verification to mark a task as finished.
### deleteTask
- Purpose: Use ONLY AFTER verification to permanently remove a task.
### addEvent
- Purpose: Ask ONE field per turn (event type, start/end time, location, recurrence). Do NOT create the event until the user has answered all the fields they care about. Call the tool immediately after the last field — no final "summary" confirmation.
- **Anti-pattern**: "I'll schedule the standup. Would you like to set a time or location?" — This is WRONG. You must ask one field at a time BEFORE creating.
- Event Type & Duration: For duration events (meetings, workouts), set eventType to 'interval' with startTime and endTime. For momentary events (deadlines, drops, releases), set eventType to 'point' and omit endTime.
- Recurrence: Populate 'recurrence' for repeating routines (daily/weekly). Set base startTime to the first occurrence.
### deleteEvent
- Purpose: Use ONLY AFTER verification to remove a scheduled event.
### updateEvent
- Purpose: Use ONLY AFTER verification to modify an existing standalone event or update ALL occurrences of an entire recurring series. Provide only the fields that need modification.
### updateEventOccurrence
- Purpose: Use ONLY AFTER verification to modify or reschedule a single day/occurrence of a recurring series (e.g., 'move Tuesday gym to 8am'). Provide seriesId and originalStartTime. Explain clearly during confirmation that ONLY this specific date was modified.
### fetchUrl
- Purpose: Fetch and read the content of a URL shared by the user. Use this to read web pages, articles, or documents at a specific URL.
- THE URL FIDELITY PROTOCOL:
  1. When the user shares a URL or asks about content behind a link, you MUST call fetchUrl on that URL before answering.
  2. NEVER describe, summarize, or paraphrase what you think is at a URL without fetching it first. Guessing causes hallucinations.
  3. If fetchUrl returns empty, a fetch error, or "Failed to fetch URL", say "I couldn't read that page" — do not guess what it might contain.
  4. This protocol overrides any general knowledge you may have about the domain or site. Always fetch, never assume.
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
- Purpose: Save granular, long-term facts, technology preferences, work contexts, personal traits, hobbies, or domain-specific details about the user (e.g., "User is currently building a Next.js 15 app", "User loves music and considers themselves a good singer").
- Mandatory Action Rule: You MUST proactively call this tool immediately whenever the user reveals durable, long-term facts about themselves (hobbies, skills, life context, tech stack, workspace details, preferred methodologies, or recurring personal/work-related struggles).
- Mandatory Skip Rule: Do NOT call this tool for purely conversational phrases that carry no durable information about the user (e.g., "Thanks!", "I agree", "That makes sense", "Nice", "Sounds good"). However, personal preferences, tastes, opinions, habits, and life context — even casual ones like favorite foods, music, hobbies — ARE durable facts worth saving. Also skip if the user is repeating a fact already saved in memories.
- Exemption: This tool is strictly EXEMPT from the Verification Protocol. You do not need the user's permission or confirmation to save a memory; call it silently and instantly during the turn.
### deleteSemanticMemory
- Purpose: Delete a specific long-term semantic memory/fact if the user explicitly corrects a previously remembered fact or requests that it be forgotten.
- Verification Protocol: You MUST ask for confirmation/verification before calling this tool, unless the user's message is an explicit instruction to delete/forget it (e.g., "Forget that I have a cat").
### searchHistoricalEntities
- Purpose: Search the user's completed tasks and past events on demand. Use when the user asks retrospective questions about what they've done, finished, or attended.
- Parameters: type ("tasks", "events", or "all"), optional query (keyword filter), optional startTime/endTime (date range in UTC ms), optional limit (max results).
- Behavior: Returns a combined list of completed tasks and/or past events within the specified range.
- Auto-Search Pattern: You may proactively call this tool before answering historical questions. Do NOT say you don't know about past activity — use this tool.
### batchAddTasks
- Purpose: Create multiple tasks in a single operation. Use whenever the user lists multiple items to add (e.g., "Add buy milk, do laundry, and call dentist"). DO NOT call addTask sequentially for each item.
- Parameters: tasks (array of { text, priority?, category?, dueDate?, notes? }).
- Behavior: Returns generated IDs for all created tasks.
- **Exempt from step-by-step Q&A**: Use immediately when user lists multiple items — do not ask for per-task priority/category/dueDate unless explicitly requested.
- **Smart Grouping Rule**: If multiple items belong to the same errand category (e.g., groceries, hardware store supplies, pharmacy items), group them into ONE task with a descriptive title and a checklist in the notes field. For example, "buy milk, eggs, bread, butter" → one task titled "Buy groceries" with notes containing the checklist. Only create separate tasks for genuinely distinct categories (e.g., "buy milk, call plumber, finish report" → three separate tasks).
### getTaskNotes
- Purpose: Retrieve the full chronological journal for a specific task. The system briefing only shows the current statusHook and metadata — full notes are loaded on demand with this tool.
- Parameters: taskId.
- When to use: When the user asks "What's the history of X?", "Show me the notes for Y", or wants detailed progress context beyond the status hook.
### getTaskResources
- Purpose: Retrieve the linked resources (URLs and files) for a specific task. The system briefing shows resource count but not full details — full resources are loaded on demand with this tool.
- Parameters: taskId.
- When to use: When the user asks "What's linked to X?", "Show me the files/URLs attached to Y", or wants to view or re-access linked resources.
### getEventResources
- Purpose: Retrieve the linked resources (URLs and files) for a specific event.
- Parameters: eventId.
- When to use: When the user asks what resources are linked to an event, or wants to view files/URLs attached to an event.
### listWorkspaces
- Purpose: List the user's workspace names, IDs, and colors for context switching and categorization.
- Parameters: none.
- When to use: When the user asks about their workspaces, wants to move items between them, or you need workspace context.
### create_habit
- Purpose: Creates a new habit routine for the user in the active workspace. Do not use for one-off tasks.
- Parameters: name (string), description (optional string), frequency (daily/custom), daysOfWeek (optional array of numbers).
### log_habit
- Purpose: Logs a habit execution (completed or skipped) silently. Runs instantly without confirmation — the user can correct you if wrong.
- Parameters: habitId (string), dateString (string, local format YYYY-MM-DD), status (completed/skipped), notes (optional string).
- When logging from a conversational remark (e.g. "too tired after the flight"), pass the user's own words as the notes field.
- ALWAYS include a natural language acknowledgement in your response after calling this tool.
### get_habit_consistency
- Purpose: Queries consistency percentages, streak metadata, and log details. Executed silently.
- Parameters: periodStartDate (string), periodEndDate (string).

# 7. LIVING TASK CONTEXT & BACKEND-ENFORCED JOURNALING
You maintain a "living chronological journal" on every task and event inside the 'notes' field.
This is YOUR memory per entity. You must track the evolution of user progress, emotions, and blockers over time.

- MANDATORY JOURNALING & STATUS HOOK PROTOCOL:
When updating notes via 'updateTask' or 'updateEvent', provide ONLY the raw content of your new observation (e.g., 'Progress 50%. Blocked by router config.').
DO NOT include any date, time, or bracket formatting in the note parameter. The backend server will automatically prepend the absolute system timestamp [YYYY-MM-DD HH:mm] and append it safely to the existing history.
In addition, ALWAYS synthesize a single punchy sentence into 'statusHook' describing the most current entity state for notification banners and quick UI glances.

- USER-DIRECTED CORRECTIONS:
If the user explicitly asks you to remove, correct, or edit a specific note entry, you may surgically edit or remove that specific entry. Do NOT rewrite or overwrite the entire notes field — only modify what the user asked to change. This is the only exception to the append-only rule.

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

# 8. RESOURCE LINKING (Task & Event Assets)
You can link URLs and file attachments to tasks and events using the structured 'resources' field on addTask/updateTask.
When a user shares a URL or file and asks to associate it with a task (e.g., "Link this Figma to the Q2 Planning task"):

resources: [{ type: "url", title: "Figma Specs Workspace", url: "https://figma.com/file/xxx", summary: "Optional one-line summary of the content" }]

For file attachments that were uploaded in chat, you know their content because you've seen it. Include a concise summary:
resources: [{ type: "document", title: "budget_draft.pdf", url: "storage:STORAGE_ID", summary: "Q2 budget breakdown, total $2.4M across 3 regions" }]

To view resources linked to an existing task or event, use getTaskResources or getEventResources.
These tools return the full resources array including titles, URLs, summaries, and types.

When a user shares a URL in chat and expects you to read its content, use fetchUrl to retrieve the page content. The system can extract text from HTML pages and PDF documents automatically.
When a user uploads PDF files, the system extracts their text content so you can read and discuss them even if you are a text-only model.

Rules:
- Include a summary only if you know the content from the conversation (don't make it up).
- The backend automatically merges new resources with existing ones (deduped by URL).
- Only link resources when the user explicitly asks to associate them with a task or event.
`;

function getTaskModel(profile: any, task: string): string {
  const models = (profile?.preferences as any)?.taskModels;
  const taskModel = models?.[task];
  if (taskModel) return taskModel;
  
  const configs = (profile?.preferences as any)?.customConfigs || {};
  const provider = (profile?.preferences as any)?.provider || "gemini";
  const mainModel = configs[provider]?.modelId;
  if (mainModel) return mainModel;

  // Provider-aware default fallbacks
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "anthropic") return "claude-3-5-haiku-latest";
  if (provider === "lmstudio") return ""; // LM Studio automatically resolves local models
  return "gemini-2.0-flash-lite"; // Default to Gemini
}

export const chat = internalAction({
  args: {
    sessionId: v.id("chatSessions"),
    userId: v.id("users"),
    messageId: v.optional(v.id("messages")),
    text: v.string(),
    author: v.string(),
    timezone: v.optional(v.string()),
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
    scope: v.optional(v.object({
      type: v.union(v.literal("date"), v.literal("task"), v.literal("event"), v.literal("habit")),
      id: v.string(),
      title: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.messages.getSession, { id: args.sessionId, userId: args.userId });
    const workspaceId = session?.workspaceId;

    // 1. Fetch user profile and relevant memories via Vector Search
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    
    // Get custom configs and selected provider
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const providerStr = (profile?.preferences as any)?.provider || "gemini";

    // Validate active provider API Key
    let activeKey = "";
    if (providerStr === "gemini") {
      activeKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY || "";
    } else if (providerStr === "openai") {
      activeKey = customConfigs.openai?.apiKey || process.env.OPENAI_API_KEY || "";
    } else if (providerStr === "anthropic") {
      activeKey = customConfigs.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || "";
    } else if (providerStr === "lmstudio") {
      activeKey = "lm-studio"; // Local execution
    }

    if (!activeKey) {
      console.error(`API Key for provider "${providerStr}" is not set in environment variables or custom config.`);
      const providerLabel = providerStr === "gemini" ? "Google Gemini" : providerStr === "openai" ? "OpenAI" : providerStr === "anthropic" ? "Anthropic" : providerStr;
      await ctx.runMutation(internal.messages.internalSend, {
        sessionId: args.sessionId,
        text: `I'm sorry, I can't process your request right now because the API key for ${providerLabel} is missing. Please add it in Settings.`,
        author: "AI",
      });
      return;
    }

    // Get Gemini key for embedding/vector search fallback if available
    const geminiApiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

    let personalityFragments = "No specific patterns learned yet.";
    if (genAI) {
      try {
        const queryEmbedding = await getEmbedding(genAI, args.text);

        const searchResults = await ctx.vectorSearch("memories", "by_embedding", {
          vector: queryEmbedding,
          limit: 10,
          filter: (q) => q.eq("userId", args.userId),
        });

        if (searchResults.length > 0) {
          const now = Date.now();
          const matchedWithScores = await Promise.all(
            searchResults.map(async (res) => {
              const doc = await ctx.runQuery(api.ai.getMemoryById, { id: res._id });
              if (!doc) return null;
              const updatedAt = doc.updatedAt ?? doc.createdAt ?? now;
              const recencyFactor = Math.max(0, 1 - (now - updatedAt) / (30 * 24 * 60 * 60 * 1000));
              const finalScore = res._score * (1 + 0.1 * recencyFactor);
              return {
                text: doc.text,
                finalScore,
              };
            })
          );

          const validMatches = matchedWithScores.filter((m): m is { text: string; finalScore: number } => m !== null);
          validMatches.sort((a, b) => b.finalScore - a.finalScore);
          
          const top5 = validMatches.slice(0, 5).map(m => m.text);
          if (top5.length > 0) {
            personalityFragments = top5.join("\n- ");
          }
        }
      } catch (err) {
        console.error("Vector search failed:", err);
      }
    } else {
      console.warn("GEMINI_API_KEY is not available. Skipping vector memory search.");
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
    const pendingTasks = briefing.tasks.filter((t: any) => !t.completed);
    const completedTasks = briefing.tasks.filter((t: any) => t.completed);

    const sortedTasks = [...pendingTasks].sort((a, b) => {
      const pA = priorityWeight[a.priority || "medium"] ?? 2;
      const pB = priorityWeight[b.priority || "medium"] ?? 2;
      if (pA !== pB) return pA - pB;
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const formatTaskDate = (ts?: number) => {
      if (!ts) return "N/A";
      const dt = args.timezoneOffset !== undefined ? new Date(ts - (args.timezoneOffset * 60000)) : new Date(ts);
      return dt.toLocaleString("en-US", { hour12: false });
    };

    const fmtDate = (t: { dueDateStr?: string; dueDate?: number }) => t.dueDateStr || (t.dueDate ? formatTaskDate(t.dueDate) : "");

    const pendingTasksContext = sortedTasks.map(t => {
      const dateStr = (t.dueDateStr || t.dueDate) ? ` | Due: ${fmtDate(t)}` : "";
      const progressStr = t.progress !== undefined ? ` | Progress: ${t.progress}%` : "";
      const hookStr = t.statusHook ? ` | Hook: "${t.statusHook}"` : "";
      const notesStr = t.notes ? `\n  Notes:\n  ${t.notes.split("\n").join("\n  ")}` : "";
      return `- [${t._id}] ${t.text}${dateStr}${progressStr}${hookStr} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"})${notesStr}`;
    }).join("\n");

    const sortedCompletedTasks = [...completedTasks].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const completedTasksContext = sortedCompletedTasks.map(t => {
      const createdStr = `Created: ${formatTaskDate(t._creationTime)}`;
      const dueStr = (t.dueDateStr || t.dueDate) ? `, Due: ${fmtDate(t)}` : "";
      const completedStr = t.completedAt ? `, Completed: ${formatTaskDate(t.completedAt)}` : "";
      const notesStr = t.notes ? `\n  Notes:\n  ${t.notes.split("\n").join("\n  ")}` : "";
      return `- [${t._id}] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}${completedStr}]${notesStr}`;
    }).join("\n");

    const upcomingEvents = await ctx.runQuery(api.events.list, { workspaceId, userId: args.userId });
    const sortedEvents = upcomingEvents
      .filter((e: any) => e.startTime > Date.now() - 3600000)
      .sort((a: any, b: any) => {
        if (a.eventType === "point" && b.eventType !== "point") return -1;
        if (b.eventType === "point" && a.eventType !== "point") return 1;
        return a.startTime - b.startTime;
      });
    const upcomingEventsContext = sortedEvents
      .map((e: any) => {
        const eventDate = args.timezoneOffset !== undefined
          ? new Date(e.startTime - (args.timezoneOffset * 60000))
          : new Date(e.startTime);
        const hookStr = e.statusHook ? ` | Hook: "${e.statusHook}"` : "";
        const outcomeStr = e.outcome ? ` | Outcome: "${e.outcome}"` : "";
        const notesStr = e.notes ? `\n  Notes:\n  ${e.notes.split("\n").join("\n  ")}` : "";
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })}) [Type: ${e.eventType || "interval"}]${hookStr}${outcomeStr}${notesStr}`;
      })
      .join("\n");

    let todayDateString = "";
    if (args.timezoneOffset !== undefined) {
      const now = new Date();
      const localTime = new Date(now.getTime() - (args.timezoneOffset * 60000));
      todayDateString = `${localTime.getFullYear()}-${String(localTime.getMonth() + 1).padStart(2, "0")}-${String(localTime.getDate()).padStart(2, "0")}`;
    } else {
      const now = new Date();
      todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    const activeHabits = await ctx.runQuery(api.habits.getHabits, {
      workspaceId: workspaceId ?? undefined,
      userId: args.userId,
      todayDateString,
    });

    const habitsContextLines = activeHabits.map((h: any) => {
      const todayLog = h.recentLogs?.find((l: any) => l.dateString === todayDateString);
      const statusStr = todayLog ? `Today: ${todayLog.status.toUpperCase()}` : "Today: PENDING (Not logged yet)";
      const schedStr = h.frequency === "daily" ? "Daily" : `Days: [${h.frequencyConfig?.daysOfWeek?.join(",")}]`;
      const lastLoggedStr = h.lastLoggedDate ? ` | Last Logged: ${h.lastLoggedDate}` : "";
      const weeklyRate = h.weeklyRate ?? 0;
      const completed = h.weeklyStats?.completed ?? 0;
      const scheduled = h.weeklyStats?.scheduled ?? 0;
      return `- [${h._id}] "${h.name}" (${schedStr}) | Current Streak: ${h.currentStreak} day(s) (Longest: ${h.longestStreak}d), Weekly Rate: ${weeklyRate}% (${completed}/${scheduled} Completed) | ${statusStr}${lastLoggedStr}`;
    });
    const habitsContext = habitsContextLines.join("\n");

    // Fetch OCEAN digest data
    const latestWeeklyDigest = await ctx.runQuery(api.ai.getLatestWeeklyDigest, { userId: args.userId });
    const latestMonthlyDigest = profile?.monthlyNotesSummaries?.[0] || "";

    // Session prolong inactivity check: compare digest timestamps vs session last activity
    const sessionLastActivity = (session as any)?.lastActivity ?? (session as any)?.updatedAt ?? 0;
    let injectDigests = true; // Default: inject on first message
    if (latestWeeklyDigest || latestMonthlyDigest) {
      const latestDigestTime = Math.max(
        latestWeeklyDigest?.createdAt ?? 0,
        latestMonthlyDigest ? sessionLastActivity : 0 // Monthly digest has no separate timestamp — use session check
      );
      // If session was active after the latest digest was created, no need to re-inject
      if (sessionLastActivity > latestDigestTime) {
        injectDigests = false;
      }
    }

    // Always inject if no digests exist yet (first week of usage)
    if (!latestWeeklyDigest && !latestMonthlyDigest) {
      injectDigests = true;
    }

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

    const scopeContext = args.scope
      ? `ACTIVE SCOPE (PINNED CONTEXT):\nThe user has explicitly pinned the following item to this chat message:\n[${args.scope.type.toUpperCase()}] ${args.scope.title} (ID: ${args.scope.id})\n\nCRITICAL INSTRUCTION: When answering or executing tool calls for this query, ALWAYS prioritize this specific pinned context. If the user says "this", "reschedule this", "mark this done", etc., they are referring directly to this pinned active scope!`
      : "";

    const systemInstruction = `
      You are ${session?.personaName || "Dialogue"}. ${session?.personaPrompt || "You build relationships through concrete behaviors, not prescribed tones."}

      ${SKILLS_INSTRUCTION}
      ${briefingContext}
 
      ${workspaceContext}
      ${scopeContext}

      Current Time: ${nowString}
      User Name: "${profile?.name || "User"}"

      --- IDENTITY (Stable Core) ---
      User Personality Bio: "${profile?.bio || "New user."}"
      This is the user's stated identity — who they are, how they prefer to communicate, their role. Treat this as highly stable. If the user contradicts something here, update the bio.

      ## INSTRUCTION:
      Always address the user by their "User Name" if it is set to something other than "User". Use it naturally in your responses.

      --- SCHEDULE CONTEXT (Immediate) ---
      Pending Tasks: ${pendingTasksContext || "None."}

      Recently Completed: ${completedTasksContext || "None."}

      CRITICAL TIMELINESS RULE: To evaluate if a task was completed fast or late, you MUST compare the Completion time against the Due Date, not the Creation time. A large gap between Creation and Completion does not mean the user procrastinated if the task was completed before its Due Date. Emphasize and heavily weight High Priority tasks in your summaries.
      
      Upcoming Events: ${upcomingEventsContext || "None."}
      
      Active Habits: ${habitsContext || "None."}

      --- BEHAVIORAL PATTERNS (OCEAN Digest) ---
      ${injectDigests ? `
      ${latestMonthlyDigest ? `Monthly OCEAN Digest:\n${latestMonthlyDigest}` : "No monthly OCEAN digest yet."}
      ${latestWeeklyDigest ? `Weekly OCEAN Digest (${latestWeeklyDigest.weekLabel}):\n${latestWeeklyDigest.digest}` : "No weekly OCEAN digest yet."}
      ` : "Digests up to date — not re-injected."}
      
      These are behavioral patterns analyzed from the user's activity using the Big 5 (OCEAN) personality framework. They reflect observed behavior — not stated preferences. The agent uses these to adapt tone and suggestions. NEVER state a pattern to the user as if they told you it. If they ask "why do you always suggest X?", THEN you may cite these observations.

      --- RELEVANT FACTS (Mentioned in Past Chats) ---
      ${personalityFragments ? `- ${personalityFragments}` : "No relevant facts found."}
      
      These are things the user has mentioned before. They may be outdated or change without notice. If the user contradicts a fact, ignore the old fact and adapt to what they say now.
    `;

    // 2. Define Tools for Gemini
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "addTask",
            description: "Ask ONE field per turn (priority, category, due date, notes). Call this tool immediately after the last field is answered. No final confirmation needed.",
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
                resources: {
                  type: SchemaType.ARRAY,
                  description: "Optional resources (URLs or file attachments) to link to this task",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      type: { type: SchemaType.STRING, description: "'url' for web links, 'document' for uploaded files" },
                      title: { type: SchemaType.STRING, description: "Display title for the resource" },
                      url: { type: SchemaType.STRING, description: "The URL or 'storage:STORAGE_ID' for documents" },
                      summary: { type: SchemaType.STRING, description: "Optional concise summary of the resource content" },
                    },
                    required: ["type", "title", "url"],
                  },
                },
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
                notes: { type: SchemaType.STRING, description: "Chronological journal of this task's history. When updating, NEVER overwrite previous entries unless the user explicitly asks you to remove or correct a specific entry. Always APPEND your new update on a new line starting with today's date and time in brackets [YYYY-MM-DD HH:mm]." },
                progress: { type: SchemaType.NUMBER, description: "Estimated progress 0-100. Infer naturally from conversation — do NOT ask the user 'what percentage is completed?'" },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing the latest current state. Used directly for quick UI glances and notifications." },
                resources: {
                  type: SchemaType.ARRAY,
                  description: "Optional resources (URLs or file attachments) to link to this task. New resources are merged with existing ones — duplicates by URL are skipped.",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      type: { type: SchemaType.STRING, description: "'url' for web links, 'document' for uploaded files" },
                      title: { type: SchemaType.STRING, description: "Display title for the resource" },
                      url: { type: SchemaType.STRING, description: "The URL or 'storage:STORAGE_ID' for documents" },
                      summary: { type: SchemaType.STRING, description: "Optional concise summary of the resource content" },
                    },
                    required: ["type", "title", "url"],
                  },
                },
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
            description: "Ask ONE field per turn (event type, start/end time, location, recurrence). Call this tool immediately after the last field is answered. No final confirmation needed.",
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
                },
                resources: {
                  type: SchemaType.ARRAY,
                  description: "Optional resources (URLs or file attachments) to link to this event",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      type: { type: SchemaType.STRING, description: "'url' for web links, 'document' for uploaded files" },
                      title: { type: SchemaType.STRING, description: "Display title for the resource" },
                      url: { type: SchemaType.STRING, description: "The URL or 'storage:STORAGE_ID' for documents" },
                      summary: { type: SchemaType.STRING, description: "Optional concise summary of the resource content" },
                    },
                    required: ["type", "title", "url"],
                  },
                },
              },
              required: ["title", "startTime", "eventType"],
            },
          },
          {
            name: "updateEvent",
            description: "Updates an existing scheduled event by its ID. Provide only the fields you want to change. Set cancelled to true to cancel an event.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                eventId: { type: SchemaType.STRING, description: "The ID of the event to update" },
                title: { type: SchemaType.STRING, description: "The new event title" },
                startTime: { type: SchemaType.STRING, description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T11:50:00')" },
                endTime: { type: SchemaType.STRING, description: "ISO-8601 end time (24-hour format, e.g. '2026-05-15T13:00:00')" },
                eventType: { type: SchemaType.STRING, description: "'interval' or 'point'" },
                location: { type: SchemaType.STRING, description: "Optional new location" },
                notes: { type: SchemaType.STRING, description: "Chronological pre-event prep notes or context. Always append with timestamp [YYYY-MM-DD HH:mm]. If the user explicitly asks to remove or correct a specific entry, you may surgically edit it." },
                outcome: { type: SchemaType.STRING, description: "Post-event summary: decisions made, action items, key takeaways. Updated after the event concludes." },
                statusHook: { type: SchemaType.STRING, description: "A single punchy sentence summarizing the event status or prep state for quick UI glances and notifications." },
                cancelled: { type: SchemaType.BOOLEAN, description: "Set to true to cancel/soft-delete this event without removing it." },
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
                },
                resources: {
                  type: SchemaType.ARRAY,
                  description: "Optional resources (URLs or file attachments) to link to this event. New resources are merged with existing ones — duplicates by URL are skipped.",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      type: { type: SchemaType.STRING, description: "'url' for web links, 'document' for uploaded files" },
                      title: { type: SchemaType.STRING, description: "Display title for the resource" },
                      url: { type: SchemaType.STRING, description: "The URL or 'storage:STORAGE_ID' for documents" },
                      summary: { type: SchemaType.STRING, description: "Optional concise summary of the resource content" },
                    },
                    required: ["type", "title", "url"],
                  },
                },
              },
              required: ["eventId"],
            },
          },
          {
            name: "updateEventOccurrence",
            description: "Modifies or reschedules a single detached occurrence of a recurring event series (e.g. moving just this Tuesday's workout to 8am). Set cancelled to true to cancel this occurrence only.",
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
                cancelled: { type: SchemaType.BOOLEAN, description: "Set to true to cancel this specific occurrence of the recurring series" },
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
            name: "deleteSemanticMemory",
            description: "Deletes a specific long-term semantic memory/fact about the user by its memory ID.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                memoryId: { type: SchemaType.STRING, description: "The ID of the memory to delete" },
              },
              required: ["memoryId"],
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
          {
            name: "searchHistoricalEntities",
            description: "Searches completed tasks and past calendar events within a date range. Use when the user asks about what they've done, finished, or attended in the past (e.g., 'What did I complete last week?', 'Show me events from March').",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                type: { type: SchemaType.STRING, description: "What to search: 'tasks', 'events', or 'all'. 'tasks' for completed tasks, 'events' for past events, 'all' for both" },
                query: { type: SchemaType.STRING, description: "Optional keyword to filter results (e.g. 'PR review', 'meeting')" },
                startTime: { type: SchemaType.NUMBER, description: "Optional start of date range in UTC milliseconds" },
                endTime: { type: SchemaType.NUMBER, description: "Optional end of date range in UTC milliseconds" },
                limit: { type: SchemaType.NUMBER, description: "Optional max results to return (default 20)" },
              },
              required: ["type"],
            },
          },
          {
            name: "batchAddTasks",
            description: "Creates multiple tasks in a single operation. Use when the user provides a list of tasks to add (e.g., 'Add groceries, laundry, and call the dentist'). Exempt from step-by-step Q&A — create all tasks immediately. Smart Grouping: if multiple items are from the same errand category (groceries, hardware, pharmacy), group them into ONE task with items listed in notes. Only create separate tasks for genuinely distinct categories. Do NOT call addTask repeatedly — use this one tool instead.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                tasks: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      text: { type: SchemaType.STRING, description: "The task description" },
                      priority: { type: SchemaType.STRING, description: "Optional priority: 'low', 'medium', or 'high'" },
                      category: { type: SchemaType.STRING, description: "Optional category" },
                      dueDate: { type: SchemaType.STRING, description: "Optional ISO-8601 due date (24-hour, e.g. '2026-05-15T14:00:00'). DO NOT append 'Z'." },
                      notes: { type: SchemaType.STRING, description: "Optional extra notes" },
                    },
                    required: ["text"],
                  },
                },
              },
              required: ["tasks"],
            },
          },
          {
            name: "getTaskNotes",
            description: "Retrieves the full chronological notes/journal for a specific task. Use when the user asks about the history, progress log, or detailed context of a task (e.g., 'Show me the notes for my CCNA lab task').",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to retrieve notes for" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "fetchUrl",
            description: "YOU MUST call this whenever the user shares a URL or asks about content behind a link. Fetches and reads the content of a URL shared by the user — use this to read web pages, articles, or documents at a specific URL. NEVER describe or summarize what's behind a link without fetching it first. Do not guess what's behind a link — fetch it.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                url: { type: SchemaType.STRING, description: "The full URL to fetch and read" },
              },
              required: ["url"],
            },
          },
          {
            name: "getTaskResources",
            description: "Retrieves the linked resources (URLs and files) for a specific task. Use when the user asks what resources are linked to a task, or wants to view files/URLs attached to a task.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                taskId: { type: SchemaType.STRING, description: "The ID of the task to retrieve resources for" },
              },
              required: ["taskId"],
            },
          },
          {
            name: "getEventResources",
            description: "Retrieves the linked resources (URLs and files) for a specific event. Use when the user asks what resources are linked to an event, or wants to view files/URLs attached to an event.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                eventId: { type: SchemaType.STRING, description: "The ID of the event to retrieve resources for" },
              },
              required: ["eventId"],
            },
          },
          {
            name: "listWorkspaces",
            description: "Lists all workspaces the user has created. Use when the user asks about their workspaces, wants to switch context, or you need to know available workspaces for categorization.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
              required: [],
            },
          },
          {
            name: "create_habit",
            description: "Creates a new habit routine for the user in the active workspace. Do not use for one-off tasks.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING, description: "The concise name of the habit, e.g. 'Skincare', 'Generate Leads'" },
                description: { type: SchemaType.STRING, description: "Optional details about how the user likes to fulfill this routine" },
                frequency: { type: SchemaType.STRING, description: "Frequency type: 'daily' or 'custom'" },
                daysOfWeek: {
                  type: SchemaType.ARRAY,
                  description: "For custom frequency: Array of active days (0=Sunday, 1=Monday, ..., 6=Saturday)",
                  items: { type: SchemaType.NUMBER }
                }
              },
              required: ["name", "frequency"],
            },
          },
          {
            name: "log_habit",
            description: "Logs a habit execution (completed or skipped) silently. Runs instantly without confirmation — the user can correct you if wrong. When logging from a conversational remark, pass the user's own words as the notes field. ALWAYS include a natural language acknowledgement in your response after calling this tool.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                habitId: { type: SchemaType.STRING, description: "The unique ID of the habit to log" },
                dateString: { type: SchemaType.STRING, description: "The local timezone-adjusted date in YYYY-MM-DD format" },
                status: { type: SchemaType.STRING, description: "Status: 'completed' or 'skipped'" },
                notes: { type: SchemaType.STRING, description: "Optional notes about this log entry. When logging from a conversational inference, put the user's own words here (e.g. 'User mentioned: exhausted after the flight')." }
              },
              required: ["habitId", "dateString", "status"],
            },
          },
          {
            name: "get_habit_consistency",
            description: "Queries consistency percentages, streaks, and logs. Executed silently.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                periodStartDate: { type: SchemaType.STRING, description: "The start date in YYYY-MM-DD format" },
                periodEndDate: { type: SchemaType.STRING, description: "The end date in YYYY-MM-DD format" },
              },
              required: ["periodStartDate", "periodEndDate"],
            },
          },
          {
            name: "list_unread_notifications",
            description: "Retrieves a list of unread notifications and alerts for the active user. Use when the user asks what notifications, reminders, or alerts they have pending.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
              required: [],
            },
          },
          {
            name: "create_custom_reminder",
            description: "Schedules a custom reminder message to trigger as a system notification at a specific future date and time.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                message: { type: SchemaType.STRING, description: "The text of the reminder (e.g. 'Submit draft')" },
                dueDate: { type: SchemaType.STRING, description: "ISO-8601 reminder date/time in 24-hour format (e.g., '2026-05-15T14:00:00'). DO NOT append 'Z'." },
              },
              required: ["message", "dueDate"],
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
        .filter((m: any) => m._id !== args.messageId)
        .slice(-20)
        .map((msg: any) => {
          const attachmentContext = (msg.attachments || [])
            .map((a: any) => `[File: ${a.fileName}${a.extractedText ? ` (Content: ${a.extractedText.substring(0, 500)}...)` : ""}]`)
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
      const executedActionSummaries: Array<{ name: string; summary: string; isSearch?: boolean }> = [];

      const providerStr = (profile?.preferences as any)?.provider || "gemini";
      const customConfigs = (profile?.preferences as any)?.customConfigs || {};

      const prompt = `
      Conversation History:
      ${transcript}

      User's New Message: ${args.text}
      `;

      let mediaParts: Part[] = [];
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
          }

          if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
            try {
              const { extractText } = await import("unpdf");
              const arrayBuffer = await fileBytes.arrayBuffer();
              const { text: pdfText } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
              const extractedValue = pdfText.trim();
              if (extractedValue) {
                extractedTexts.push(`[CONTENT OF PDF: ${fileName}]\n${extractedValue}`);
                if (args.messageId) {
                  await ctx.runMutation(internal.messages_internal.saveExtractedText, {
                    messageId: args.messageId,
                    storageId,
                    text: extractedValue
                  });
                }
              }
            } catch (err) {
              console.error(`Error extracting text from PDF ${fileName}:`, err);
            }
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

      // Image OCR fallback for text-only providers
      if (!isMultimodalProvider(providerStr) && mediaParts.length > 0) {
        const imageParts = mediaParts.filter(p => p.inlineData?.mimeType?.startsWith("image/"));
        if (imageParts.length > 0 && genAI) {
          const geminiModelId = getTaskModel(profile, "ocr");
          const ocrModel = genAI.getGenerativeModel({ model: geminiModelId });
          for (const part of imageParts) {
            try {
              const ocrResult = await ocrModel.generateContent([
              { text: "Extract all visible text from this image verbatim. If there is no readable text, describe what you see in 1-2 sentences." },
                part
              ]);
              const ocrText = ocrResult.response.text().trim();
              if (ocrText) {
                extractedTexts.push(`[IMAGE CONTENT]\n${ocrText}`);
              }
            } catch (err) {
              console.error("Error OCR-ing image:", err);
            }
          }
        } else if (imageParts.length > 0) {
          // No Gemini key available — add descriptive stubs
          extractedTexts.push(`[User attached ${imageParts.length} image(s) — OCR unavailable]`);
        }
        mediaParts = [];
      }

      let engineResult;
      try {
        engineResult = await runChatEngine({
          provider: providerStr,
          customConfigs,
          systemInstruction,
          transcript,
          userMessage: args.text,
          mediaParts,
          extractedTexts,
          tools
        });
      } catch (err: any) {
        if (err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("Rate Limit")) {
          console.error("Rate Limit Hit:", err);
          await ctx.runMutation(internal.messages.internalSend, {
            sessionId: args.sessionId,
            text: "Waduh, sepertinya saya sedang menerima terlalu banyak permintaan (Rate Limit). Coba lagi dalam beberapa saat ya! 🙏",
            author: "AI",
          });
          return;
        }
        throw err;
      }

      const calls = engineResult.calls;
      const reasoningContent = engineResult.reasoningContent;
      aiText = engineResult.text; // Use initial text if there are no tools

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
              resources?: Array<{
                type: "url" | "document";
                title: string;
                url: string;
                summary?: string;
              }>;
            };

            if (call.name === "addTask") {
              const resources = taskArgs.resources?.map((r) => ({
                type: r.type as "url" | "document",
                title: r.title,
                url: r.url,
                summary: r.summary,
                linkedAt: Date.now(),
              }));

              await ctx.runMutation(api.ai.addTask, {
                text: taskArgs.text!,
                priority: taskArgs.priority,
                category: taskArgs.category,
                notes: taskArgs.notes,
                progress: taskArgs.progress,
                statusHook: taskArgs.statusHook,
                dueDate: taskArgs.dueDate ? parseLocal(taskArgs.dueDate) : undefined,
                dueDateStr: taskArgs.dueDate ? taskArgs.dueDate.split("T")[0] : undefined,
                resources,
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

              const taskUpdates: Record<string, unknown> = {};
              if (taskArgs.text) taskUpdates.text = taskArgs.text;
              if (taskArgs.completed !== undefined) taskUpdates.completed = taskArgs.completed;
              if (taskArgs.priority) taskUpdates.priority = taskArgs.priority;
              if (taskArgs.category) taskUpdates.category = taskArgs.category;
              if (taskArgs.notes) taskUpdates.notes = taskArgs.notes;
              if (taskArgs.progress !== undefined) taskUpdates.progress = taskArgs.progress;
              if (taskArgs.statusHook !== undefined) taskUpdates.statusHook = taskArgs.statusHook;
              if (taskArgs.dueDate) {
                taskUpdates.dueDate = parseLocal(taskArgs.dueDate);
                taskUpdates.dueDateStr = taskArgs.dueDate.split("T")[0];
              }
              if (taskArgs.resources) {
                taskUpdates.resources = taskArgs.resources.map((r) => ({
                  type: r.type as "url" | "document",
                  title: r.title,
                  url: r.url,
                  summary: r.summary,
                  linkedAt: Date.now(),
                }));
              }

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
              cancelled?: boolean;
              recurrence?: {
                frequency: "daily" | "weekly";
                interval: number;
                daysOfWeek?: number[];
                until?: string;
              };
              resources?: Array<{
                type: "url" | "document";
                title: string;
                url: string;
                summary?: string;
              }>;
            };

            if (call.name === "addEvent") {
              const recurrence = eventArgs.recurrence ? {
                frequency: eventArgs.recurrence.frequency,
                interval: eventArgs.recurrence.interval,
                daysOfWeek: eventArgs.recurrence.daysOfWeek,
                until: eventArgs.recurrence.until ? parseLocal(eventArgs.recurrence.until) : undefined,
                untilStr: eventArgs.recurrence.until ? eventArgs.recurrence.until.split("T")[0] : undefined,
              } : undefined;

              const eventResources = eventArgs.resources?.map((r) => ({
                type: r.type as "url" | "document",
                title: r.title,
                url: r.url,
                summary: r.summary,
                linkedAt: Date.now(),
              }));
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
                resources: eventResources,
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
              if (eventArgs.cancelled !== undefined) updates.cancelled = eventArgs.cancelled;
              if (eventArgs.recurrence) {
                updates.recurrence = {
                  frequency: eventArgs.recurrence.frequency,
                  interval: eventArgs.recurrence.interval,
                  daysOfWeek: eventArgs.recurrence.daysOfWeek,
                  until: eventArgs.recurrence.until ? parseLocal(eventArgs.recurrence.until) : undefined,
                  untilStr: eventArgs.recurrence.until ? eventArgs.recurrence.until.split("T")[0] : undefined,
                };
              }
              if (eventArgs.resources) {
                updates.resources = eventArgs.resources.map((r) => ({
                  type: r.type as "url" | "document",
                  title: r.title,
                  url: r.url,
                  summary: r.summary,
                  linkedAt: Date.now(),
                }));
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
            const occArgs = call.args as { seriesId: string; originalStartTime: string; startTime?: string; endTime?: string; eventType?: "interval" | "point"; title?: string; location?: string; cancelled?: boolean };
            const oldEvent = await ctx.runQuery(api.events.get, { id: occArgs.seriesId as Id<"events">, userId: args.userId });
            await ctx.runMutation(api.events.updateOccurrence, {
              seriesId: occArgs.seriesId as Id<"events">,
              userId: args.userId,
              timezone: args.timezone,
              originalStartTime: parseLocal(occArgs.originalStartTime),
              startTime: occArgs.startTime ? parseLocal(occArgs.startTime) : undefined,
              endTime: occArgs.endTime ? parseLocal(occArgs.endTime) : undefined,
              eventType: occArgs.eventType,
              title: occArgs.title,
              location: occArgs.location,
              cancelled: occArgs.cancelled,
            });
            executedActionSummaries.push({
              name: "updateEventOccurrence",
              summary: occArgs.cancelled
                ? `Cancelled the single occurrence on ${occArgs.originalStartTime} for recurring series '${oldEvent?.title}'. The rest of the schedule remains unchanged.`
                : `Successfully modified only the single occurrence on ${occArgs.originalStartTime} for recurring event series '${oldEvent?.title}'. New details for this single day: startTime=${occArgs.startTime || occArgs.originalStartTime}, title=${occArgs.title || oldEvent?.title}. NOTE: Added exception to parent series so it skips this date, and created a standalone event specifically for this date. The rest of the recurring schedule remains completely unchanged.`
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
            const oldProfile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
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
            if (!genAI) {
              console.warn("Skipping saveSemanticMemory because Gemini API key is not available.");
              executedActionSummaries.push({
                name: "saveSemanticMemory",
                summary: `Skipped saving memory because Google Gemini API key is not configured.`
              });
            } else {
              const saveResult = await saveSemanticMemoryInternal(ctx, genAI, text, args.userId);
              if (saveResult.status === "inserted") {
                executedActionSummaries.push({
                  name: "saveSemanticMemory",
                  summary: `Saved a new granular semantic memory: "${text}"`
                });
              } else if (saveResult.status === "updated") {
                executedActionSummaries.push({
                  name: "saveSemanticMemory",
                  summary: `Updated timestamp for existing memory: "${text}"`
                });
              } else if (saveResult.status === "skipped_duplicate") {
                executedActionSummaries.push({
                  name: "saveSemanticMemory",
                  summary: `Skipped saving duplicate memory (similarity score > 0.85).`
                });
              }
            }
            activeToolCalls.push({
              name: "saveSemanticMemory",
              args: call.args as Record<string, unknown>,
              result: { status: "success" }
            });
          } else if (call.name === "deleteSemanticMemory") {
            const { memoryId } = call.args as { memoryId: string };
            try {
              await ctx.runMutation(api.ai.deleteMemory, { id: memoryId as Id<"memories"> });
              executedActionSummaries.push({
                name: "deleteSemanticMemory",
                summary: `Successfully deleted semantic memory.`
              });
            } catch (err: any) {
              console.error(`Failed to delete memory ${memoryId}:`, err);
              executedActionSummaries.push({
                name: "deleteSemanticMemory",
                summary: `Failed to delete semantic memory: ${err.message}`
              });
            }
            activeToolCalls.push({
              name: "deleteSemanticMemory",
              args: call.args as Record<string, unknown>,
              result: { status: "success" }
            });
          } else if (call.name === "searchHistoricalEntities") {
            const histArgs = call.args as {
              type: "tasks" | "events" | "all";
              query?: string;
              startTime?: number;
              endTime?: number;
              limit?: number;
            };

            let results: unknown[] = [];
            const limit = histArgs.limit ?? 20;

            if (histArgs.type === "tasks" || histArgs.type === "all") {
              const tasks = await ctx.runQuery(api.tasks.searchHistory, {
                query: histArgs.query,
                startTime: histArgs.startTime,
                endTime: histArgs.endTime,
                limit,
                userId: args.userId,
              });
              results = results.concat(tasks.map((t) => ({
                type: "task" as const,
                id: t._id,
                text: t.text,
                completedAt: t.completedAt,
                category: t.category,
                priority: t.priority,
              })));
            }

            if (histArgs.type === "events" || histArgs.type === "all") {
              const events = await ctx.runQuery(api.events.searchHistory, {
                query: histArgs.query,
                startTime: histArgs.startTime,
                endTime: histArgs.endTime,
                limit,
                userId: args.userId,
              });
              results = results.concat(events.map((e) => ({
                type: "event",
                id: e._id,
                title: e.title,
                startTime: e.startTime,
                location: e.location,
              })));
            }

            results = results.slice(0, limit);

            executedActionSummaries.push({
              name: "searchHistoricalEntities",
              summary: `Found ${results.length} historical ${histArgs.type === "all" ? "items" : histArgs.type}`
            });
            activeToolCalls.push({
              name: "searchHistoricalEntities",
              args: call.args as Record<string, unknown>,
              result: { status: "success", count: results.length, results }
            });
          } else if (call.name === "batchAddTasks") {
            const batchArgs = call.args as {
              tasks: Array<{ text: string; priority?: string; category?: string; dueDate?: string; notes?: string }>;
            };

            const parsedTasks = batchArgs.tasks.map((t) => ({
              text: t.text,
              priority: t.priority as "low" | "medium" | "high" | undefined,
              category: t.category,
              dueDate: t.dueDate ? parseLocal(t.dueDate) : undefined,
              notes: t.notes,
            }));

            const ids = await ctx.runMutation(api.tasks.batchAdd, {
              tasks: parsedTasks,
              workspaceId,
              userId: args.userId,
            });

            executedActionSummaries.push({
              name: "batchAddTasks",
              summary: `Created ${ids.length} tasks in batch: ${batchArgs.tasks.map(t => `'${t.text}'`).join(", ")}`
            });
            activeToolCalls.push({
              name: "batchAddTasks",
              args: call.args as Record<string, unknown>,
              result: { status: "success", ids, count: ids.length }
            });
          } else if (call.name === "getTaskNotes") {
            const { taskId } = call.args as { taskId: string };
            if (!taskId) {
              activeToolCalls.push({
                name: "getTaskNotes",
                args: call.args as Record<string, unknown>,
                result: { status: "error", error: "taskId is required" }
              });
              continue;
            }
            const task = await ctx.runQuery(api.tasks.get, { id: taskId as Id<"tasks">, userId: args.userId });

            executedActionSummaries.push({
              name: "getTaskNotes",
              summary: task?.notes ? `Retrieved notes for task '${task.text}' (${task.notes.length} chars)` : `No notes found for task '${task?.text}'`
            });
            activeToolCalls.push({
              name: "getTaskNotes",
              args: call.args as Record<string, unknown>,
              result: {
                status: "success",
                taskId,
                titleHint: task?.text,
                notes: task?.notes || null,
                hasNotes: !!task?.notes,
              }
            });
          } else if (call.name === "getTaskResources") {
            const { taskId } = call.args as { taskId: string };
            if (!taskId) {
              activeToolCalls.push({
                name: "getTaskResources",
                args: call.args as Record<string, unknown>,
                result: { status: "error", error: "taskId is required" }
              });
              continue;
            }
            const task = await ctx.runQuery(api.tasks.get, { id: taskId as Id<"tasks">, userId: args.userId });

            executedActionSummaries.push({
              name: "getTaskResources",
              summary: task?.resources ? `Retrieved ${task.resources.length} resource(s) for task '${task.text}'` : `No resources found for task '${task?.text}'`
            });
            activeToolCalls.push({
              name: "getTaskResources",
              args: call.args as Record<string, unknown>,
              result: {
                status: "success",
                taskId,
                titleHint: task?.text,
                resources: task?.resources || [],
                count: task?.resources?.length || 0,
              }
            });
          } else if (call.name === "getEventResources") {
            const { eventId } = call.args as { eventId: string };
            if (!eventId) {
              activeToolCalls.push({
                name: "getEventResources",
                args: call.args as Record<string, unknown>,
                result: { status: "error", error: "eventId is required" }
              });
              continue;
            }
            const event = await ctx.runQuery(api.events.get, { id: eventId as Id<"events">, userId: args.userId });

            executedActionSummaries.push({
              name: "getEventResources",
              summary: event?.resources ? `Retrieved ${event.resources.length} resource(s) for event '${event.title}'` : `No resources found for event '${event?.title}'`
            });
            activeToolCalls.push({
              name: "getEventResources",
              args: call.args as Record<string, unknown>,
              result: {
                status: "success",
                eventId,
                titleHint: event?.title,
                resources: event?.resources || [],
                count: event?.resources?.length || 0,
              }
            });
          } else if (call.name === "fetchUrl") {
            const { url } = call.args as { url: string };
            let title = "";
            let content = "";
            let contentType = "unknown";
            let truncated = false;
            try {
              let fetchUrl = url;

              // Detect Google Docs URLs and redirect to plain-text export endpoint
              const gdocMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
              if (gdocMatch) {
                fetchUrl = `https://docs.google.com/document/d/${gdocMatch[1]}/export?format=txt`;
                contentType = "html";
              }

              // Detect Google Sheets URLs and redirect to TSV export endpoint
              const gsheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
              if (gsheetMatch) {
                fetchUrl = `https://docs.google.com/spreadsheets/d/${gsheetMatch[1]}/export?format=tsv`;
                contentType = "html";
              }

              // Detect Google Slides URLs and redirect to plain-text export endpoint
              const gslideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
              if (gslideMatch) {
                fetchUrl = `https://docs.google.com/presentation/d/${gslideMatch[1]}/export?format=txt`;
                contentType = "html";
              }

              const res = await fetch(fetchUrl, {
                headers: { "User-Agent": "Dialogue/1.0" },
                signal: AbortSignal.timeout(15000),
              });
              const mimeType = res.headers.get("content-type") || "";
              const isPdf = mimeType.includes("pdf") || url.match(/\.pdf$/i);
              const isHtml = mimeType.includes("text/html") || mimeType.includes("text/plain");

              if (isPdf) {
                contentType = "pdf";
                const buffer = await res.arrayBuffer();
                const { extractText } = await import("unpdf");
                const { text: pdfText } = await extractText(new Uint8Array(buffer), { mergePages: true });
                content = pdfText.trim();
              } else if (isHtml) {
                contentType = "html";
                const html = await res.text();
                const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
                title = titleMatch ? titleMatch[1].trim() : "";
                content = html
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
                  .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
                  .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/&[a-z]+;/g, " ")
                  .replace(/&amp;/g, "&")
                  .replace(/\s+/g, " ")
                  .trim();
              } else {
                contentType = "text";
                content = await res.text();
              }
              if (content.length > 10000) {
                content = content.slice(0, 10000) + "... [truncated]";
                truncated = true;
              }
            } catch (err: any) {
              content = `Failed to fetch URL: ${err?.message || "Unknown error"}`;
            }

            executedActionSummaries.push({
              name: "fetchUrl",
              summary: content.startsWith("Failed to fetch")
                ? content
                : `URL: ${url}\nTitle: ${title || "(no title)"}\n\n${content}`
            });
            activeToolCalls.push({
              name: "fetchUrl",
              args: call.args as Record<string, unknown>,
              result: { url, title, content, contentType, truncated }
            });
          } else if (call.name === "listWorkspaces") {
            const workspaces = await ctx.runQuery(api.workspaces.list, { userId: args.userId });

            executedActionSummaries.push({
              name: "listWorkspaces",
              summary: `Listed ${workspaces.length} workspace(s)`
            });
            activeToolCalls.push({
              name: "listWorkspaces",
              args: call.args as Record<string, unknown>,
              result: { status: "success", workspaces }
            });
          } else if (call.name === "create_habit") {
            const { name, description, frequency, daysOfWeek } = call.args as {
              name: string;
              description?: string;
              frequency: "daily" | "custom";
              daysOfWeek?: number[];
            };
            const id = await ctx.runMutation(api.habits.createHabit, {
              workspaceId: workspaceId ?? undefined,
              name,
              description,
              frequency,
              frequencyConfig: { daysOfWeek },
              userId: args.userId,
            });
            executedActionSummaries.push({
              name: "create_habit",
              summary: `Created habit '${name}' with frequency '${frequency}'`
            });
            activeToolCalls.push({
              name: "create_habit",
              args: call.args as Record<string, unknown>,
              result: { status: "success", habitId: id, name }
            });
          } else if (call.name === "log_habit") {
            const { habitId, dateString, status, notes } = call.args as {
              habitId: string;
              dateString: string;
              status: "completed" | "skipped";
              notes?: string;
            };
            const logId = await ctx.runMutation(api.habits.logHabit, {
              habitId: habitId as Id<"habits">,
              dateString,
              status,
              notes,
              timezone: args.timezone,
              userId: args.userId,
            });
            const habit = await ctx.runQuery(api.habits.get, {
              id: habitId as Id<"habits">,
              userId: args.userId,
            });
            executedActionSummaries.push({
              name: "log_habit",
              summary: `Logged habit '${habit?.name || "Unknown"}' as ${status} on ${dateString}. Current streak: ${habit?.currentStreak || 0} day(s).`
            });
            activeToolCalls.push({
              name: "log_habit",
              args: call.args as Record<string, unknown>,
              result: { status: "success", logId, newStreak: habit?.currentStreak || 0 }
            });
          } else if (call.name === "get_habit_consistency") {
            const { periodStartDate, periodEndDate } = call.args as {
              periodStartDate: string;
              periodEndDate: string;
            };
            const report = await ctx.runQuery(api.habits.getHabitConsistency, {
              workspaceId: workspaceId ?? undefined,
              periodStartDate,
              periodEndDate,
              userId: args.userId,
            });
            executedActionSummaries.push({
              name: "get_habit_consistency",
              summary: `Retrieved habit consistency for ${report.length} habit(s)`
            });
            activeToolCalls.push({
              name: "get_habit_consistency",
              args: call.args as Record<string, unknown>,
              result: { status: "success", report }
            });
          } else if (call.name === "list_unread_notifications") {
            const unread = await ctx.runQuery(api.notifications.listUnread, {});
            executedActionSummaries.push({
              name: "list_unread_notifications",
              summary: `Retrieved ${unread.length} unread notification(s)`
            });
            activeToolCalls.push({
              name: "list_unread_notifications",
              args: call.args as Record<string, unknown>,
              result: { status: "success", notifications: unread }
            });
          } else if (call.name === "create_custom_reminder") {
            const { message, dueDate } = call.args as { message: string; dueDate: string };
            const triggerTime = parseLocal(dueDate);
            const scheduledId = await ctx.scheduler.runAt(
              triggerTime,
              internal.notifications.sendScheduledNotification,
              {
                userId: args.userId,
                title: "Reminder",
                message: message,
                type: "system",
                actionUrl: "/",
              }
            );

            executedActionSummaries.push({
              name: "create_custom_reminder",
              summary: `Scheduled reminder '${message}' for ${dueDate}`
            });
            activeToolCalls.push({
              name: "create_custom_reminder",
              args: call.args as Record<string, unknown>,
              result: { status: "success", reminderId: scheduledId }
            });
          }
        }

        if (searchCalls.length > 0) {
          const searchProvider = (profile?.preferences as { searchProvider?: string })?.searchProvider || "tavily";
          const tavilyKey = customConfigs.tavily?.apiKey || process.env.TAVILY_API_KEY;
          const serperKey = customConfigs.serper?.apiKey || process.env.SERPER_API_KEY;

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

          searchResults.forEach((res, i) => {
             executedActionSummaries.push({
               name: searchCalls[i].name,
               summary: res.response.result,
               isSearch: true
             });
          });
        }

        if (executedActionSummaries.length > 0) {
          aiText = await executeChatFollowUp({
            provider: providerStr,
            customConfigs,
            systemInstruction,
            transcript,
            userMessage: args.text,
            calls,
            executedActionSummaries,
            reasoningContent,
            rawModelParts: engineResult.rawModelParts
          });
        }

        if (reflectionSummaryText) {
          aiText = reflectionSummaryText;
        }

        if (!aiText) {
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


export const generateSessionTitle = internalAction({
  args: { sessionId: v.id("chatSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const apiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getTaskModel(profile, "title") });

    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId, userId: args.userId });
    if (!messages || messages.length === 0) return;

    const transcript = messages.map((m: any) => `${m.author}: ${m.text}`).join("\n");

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
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const apiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getTaskModel(profile, "title") });

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
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const apiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const genAI = new GoogleGenerativeAI(apiKey);
    await saveSemanticMemoryInternal(ctx, genAI, args.text, args.userId);
  }
});

export const generateCronReflection = internalAction({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("weekly"), v.literal("monthly"), v.literal("yearly")),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const tz = args.timezone || "UTC";
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const apiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const lastSession = await ctx.runQuery(internal.dashboard.getLastSession, {
      userId: args.userId,
    });
    const recentMessages = lastSession
      ? await ctx.runQuery(api.messages.list, {
          sessionId: lastSession._id,
          userId: args.userId,
        })
      : [];
    const lastUserText = recentMessages.slice().reverse().find((m: any) => m.author === "User")?.text || profile?.name || "Hello";
    const lastMsgWithTz = recentMessages.slice().reverse().find((m: any) => m.timezoneOffset !== undefined);
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

    const summaryModel = genAI.getGenerativeModel({ model: getTaskModel(profile, "reflection") });
    const statsText = `
      Type: ${args.type}
      Period: ${periodLabel}
      Tasks Completed: ${stats.tasksCompleted}
      Tasks Created: ${stats.tasksCreated}
      Events Attended: ${stats.eventsAttended}
      Habits Completed: ${stats.habitLogsCompleted ?? 0}
      Habits Skipped: ${stats.habitLogsSkipped ?? 0}
      Best Habit Streak: ${stats.habitStreakDays ?? 0} day(s)
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
      Draw connections between tasks, events, and habits if possible.
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
      periodStartStr: new Date(startMs).toLocaleDateString("en-CA", { timeZone: tz }),
      periodEnd: endMs,
      periodEndStr: new Date(endMs).toLocaleDateString("en-CA", { timeZone: tz }),
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
  }
});

/**
 * Monday weekly cron: generates OCEAN digest from shared weekly data.
 * Called by ocean.cronTriggerWeekly after compileWeeklyData.
 */
export const generateWeeklyOCEAN = internalAction({
  args: {
    userId: v.id("users"),
    timezone: v.string(),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });

    const now = new Date();
    const localNow = new Date(now.getTime() - args.timezoneOffset * 60000);
    const dayOfWeek = localNow.getUTCDay(); // 0=Sun, 1=Mon

    // Calculate Monday of this week (most recent Monday before or on today)
    const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Sun=6
    const localMonday = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() - daysSinceMonday));
    const weekStartTime = localMonday.getTime() - args.timezoneOffset * 60000;
    const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;

    // Previous week (days 1-7 being analyzed)
    const prevWeekStart = weekStartTime - 7 * 24 * 60 * 60 * 1000;
    const prevWeekEnd = weekStartTime;

    // Get shared data payload
    const weeklyData = await ctx.runQuery(internal.reflections.compileWeeklyData, {
      userId: args.userId,
      periodStart: prevWeekStart,
      periodEnd: prevWeekEnd,
    });

    if (!weeklyData) return;

    // Get previous monthly digest for baseline comparison
    const profileDoc = await ctx.runQuery(internal.ocean_queries.getUserProfileForOCEAN, {
      userId: args.userId,
    });

    const monthlyDigest = (profileDoc?.monthlyNotesSummaries?.[0]) || "No monthly baseline yet.";

    // Build week label
    const weekLabelDate = new Date(localMonday);
    const weekLabel = `Week of ${weekLabelDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    // Generate OCEAN digest
    const apiKey = (profile?.preferences as any)?.customConfigs?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getTaskModel(profile, "reflection") });

    const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Analyze the user's week and produce a structured OCEAN digest.

## OCEAN Scoring Framework
For each trait, provide a percentile band and bullet-pointed evidence:
- Very Low: 0–10th | Low: 11–24th | Low-Average: 25–39th | True Average: 40–60th
- High-Average: 61–75th | High: 76–89th | Very High: 90–100th

## Traits
- **O — Openness**: Curiosity, new approaches, imagination
- **C — Conscientiousness**: Organization, goal-directed behavior, habit consistency
- **E — Extraversion**: Energy sourcing, social vs solo preference
- **A — Agreeableness**: Prosocial behavior, empathy-driven choices
- **N — Neuroticism**: Stress response, emotional stability

## Previous Month Baseline
${monthlyDigest}

## This Week's Data
${weeklyData.rawDetails}

## Instructions
1. **Retrograde Analysis** (day 7 → 1): Read the week backwards. If behavior dipped at the end, trace back to find the cause (e.g., a late-night work crunch on Thursday explains Friday's low energy). Attribute WHY behavior happened.
2. **Anterograde Analysis** (day 1 → 7): Read forwards. Detect trajectory — is each trait rising, falling, or stable? Note momentum (e.g., "Conscientiousness is in a growth phase, rising from 3→5→6→7").
3. **Score each trait** with percentile band + evidence bullets.
4. **No-Bias Rule**: If data is insufficient for a trait, say "Insufficient behavioral evidence to update [Trait] due to low logging activity" — do NOT penalize inactivity.
5. Compare against the monthly baseline: is this week consistent with the established pattern, or is it a deviation?

## Output Format
Week of [date] — OCEAN Digest:

- **Openness**: [Band] ([percentile]) — [evidence bullet points]
- **Conscientiousness**: [Band] ([percentile]) — [evidence]
  - Retrograde: [why the end-of-week pattern happened]
  - Anterograde: [trajectory description]
- **Extraversion**: [Band] ([percentile]) — [evidence]
- **Agreeableness**: [Band] ([percentile]) — [evidence]
- **Neuroticism**: [Band] ([percentile]) — [evidence]

**Baseline Comparison**: [How this week compares to the monthly baseline]
**Summary**: [2-3 sentence overall assessment]`;

    const result = await model.generateContent(prompt);
    const digest = result.response.text().trim();

    // Compute weekStartStr for the previous week's Monday
    const weekStartStr = new Date(prevWeekStart).toLocaleDateString("en-CA", { timeZone: args.timezone });

    // Check if digest already exists for this week (idempotent)
    const existing = await ctx.runQuery(internal.ocean_queries.getWeeklyDigestByWeek, {
      userId: args.userId,
      weekStart: prevWeekStart,
    });
    if (existing) return;

    // Save to weeklyDigests
    await ctx.runMutation(internal.ocean_queries.insertWeeklyDigest, {
      userId: args.userId,
      weekStart: prevWeekStart,
      weekStartStr,
      weekLabel,
      digest,
    });
  },
});

/**
 * Monthly cron: refine profile + archive weeklies.
 * Called by ocean.cronTriggerMonthly.
 */
export const generateMonthlyOCEAN = internalAction({
  args: {
    userId: v.id("users"),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const tz = args.timezone || "UTC";

    // Get the 4 most recent weekly digests
    const weeklies = await ctx.runQuery(internal.ocean_queries.getWeeklyDigestsForMonthly, {
      userId: args.userId,
    });

    if (weeklies.length === 0) return;

    // Get existing profile for baseline comparison
    const profileDoc = await ctx.runQuery(internal.ocean_queries.getUserProfileForOCEAN, {
      userId: args.userId,
    });

    const existingProfile = profileDoc?.behavioralProfile || "No existing behavioral profile.";

    // Generate monthly OCEAN summary
    const apiKey = (profile?.preferences as any)?.customConfigs?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: getTaskModel(profile, "reflection") });

    const weeklyDigests = weeklies.map((w: any) => w.digest).reverse();
    const weekLabels = weeklies.map((w: any) => w.weekLabel).reverse();

    const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Synthesize 4 weekly OCEAN digests into a monthly behavioral profile.

## Existing Behavioral Profile
${existingProfile}

## Weekly OCEAN Digests (chronological order)
${weeklyDigests.map((d: string, i: number) => `--- ${weekLabels[i]} ---\n${d}`).join("\n\n")}

## Instructions
1. **Cross-week pattern analysis**: Identify which OCEAN traits are consistent across all 4 weeks vs which are volatile. A trait that scores similarly in 3+ out of 4 weeks is a stable pattern.
2. **Trait evolution**: Note if any trait shows a clear trend across the month (e.g., Neuroticism declining from High to High-Average = positive trajectory).
3. **Refine the behavioral profile**: Compare the 4-week pattern against the existing profile. If traits are consistent, keep them. If a trait has shifted consistently for 4 weeks, update it. If only 1-2 weeks show deviation, it's situational — keep the old trait.
4. **No-Bias Rule**: Inactivity across weeks does NOT lower scores. Only sustained behavioral change updates the profile.

## Output Format
Monthly OCEAN Profile — [Month Year]:

- **Openness**: [Band] ([percentile]) — [stable/volatile] — [evidence from 4 weeks]
- **Conscientiousness**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Extraversion**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Agreeableness**: [Band] ([percentile]) — [stable/volatile] — [evidence]
- **Neuroticism**: [Band] ([percentile]) — [stable/volatile] — [evidence]

**Profile Changes**: [What changed from the existing profile, or "No changes — consistent with established pattern"]
**Summary**: [3-4 sentence overall monthly assessment]`;

    const result = await model.generateContent(prompt);
    const monthlyDigest = result.response.text().trim();

    // 1. Archive the 4 weekly digests
    for (const weekly of weeklies) {
      await ctx.runMutation(internal.ocean_queries.insertArchivedSummary, {
        userId: args.userId,
        type: "weekly",
        originalDate: weekly.weekStart,
        originalDateStr: weekly.weekStartStr || new Date(weekly.weekStart).toLocaleDateString("en-CA", { timeZone: tz }),
        content: weekly.digest,
      });
      await ctx.runMutation(internal.ocean_queries.deleteWeeklyDigest, {
        id: weekly._id,
      });
    }

    // 2. Archive previous monthly digest if exists
    if (profileDoc?.monthlyNotesSummaries?.[0]) {
      await ctx.runMutation(internal.ocean_queries.insertArchivedSummary, {
        userId: args.userId,
        type: "monthly",
        originalDate: Date.now(),
        originalDateStr: new Date().toLocaleDateString("en-CA", { timeZone: tz }),
        content: profileDoc.monthlyNotesSummaries[0],
      });
    }

    // 3. Update profile with new monthly digest and behavioral profile
    await ctx.runMutation(internal.ocean_queries.updateUserProfileOCEAN, {
      userId: args.userId,
      monthlyDigest,
    });
  },
});

export const extractAndSaveMemory = internalAction({
  args: {
    sessionId: v.id("chatSessions"),
    userId: v.id("users"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const { sessionId, userId, messageId } = args;

    // 1. Fetch user profile
    const profile = await ctx.runQuery(api.ai.getProfile, { userId, revealKeys: true });
    
    // Check if we have a Gemini key for vector embedding creation (which is mandatory for vector search)
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const geminiApiKey = customConfigs.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn("Skipping background memory extraction because GEMINI_API_KEY is not available (needed for vector embedding generation).");
      return;
    }
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // 2. Fetch session messages to build context
    const messages = await ctx.runQuery(api.messages.list, { sessionId, userId });
    const msgIdx = messages.findIndex((m: any) => m._id === messageId);
    if (msgIdx === -1) {
      console.log(`Trigger message ${messageId} not found in session.`);
      return;
    }

    const currentMsg = messages[msgIdx];
    if (currentMsg.author !== "User") {
      console.log("Trigger message is not from User. Skipping memory extraction.");
      return;
    }

    // Get up to 3 preceding messages for context
    const recentMsgs = messages.slice(Math.max(0, msgIdx - 3), msgIdx + 1);
    const historyText = recentMsgs
      .map((m: any) => `${m.author === "User" ? "User" : "Dialogue"}: ${m.text}`)
      .join("\n");

    const prompt = `You are a background cognitive agent. Your task is to identify and extract any durable, long-term personal facts, technology preferences, work contexts, skills, hobbies, or stable life details that the user revealed in their last message, using the chat history for context.

Chat History:
${historyText}

Guidelines:
1. ONLY extract things that are long-term or relatively stable (e.g., "User uses React for frontend development", "User likes to discuss the technology industry landscape", "User works from home").
2. DO NOT extract transient details, temporary tasks, or immediate plans (e.g., "User has a meeting tomorrow", "User is tired tonight", "User is testing the chat").
3. DO NOT repeat facts that have already been established or are already obvious from the conversation history.
4. Output the extracted fact in the USER'S ORIGINAL LANGUAGE as a clear, third-person declarative statement (e.g., "User suka membahas landskap industri teknologi.").
5. If no new durable personal facts are revealed in the user's last message, output ONLY the word "null" (without quotes).
6. Do not include any introductory text, explanation, or markdown formatting. Output ONLY the statement or "null".`;

    const providerStr = (profile?.preferences as any)?.provider || "gemini";
    const resolvedModelId = getTaskModel(profile, "memory");

    let extractedFact = "";
    try {
      extractedFact = await runSimpleTask({
        provider: providerStr,
        customConfigs,
        prompt,
        modelId: resolvedModelId,
      });
      extractedFact = extractedFact.trim();
    } catch (err) {
      console.error("Failed to run background memory extraction model:", err);
      return;
    }

    if (extractedFact && extractedFact.toLowerCase() !== "null") {
      console.log(`[Memory Extractor] Extracted new fact: "${extractedFact}"`);
      try {
        const saveResult = await saveSemanticMemoryInternal(ctx, genAI, extractedFact, userId);
        console.log(`[Memory Extractor] Save result:`, saveResult);
      } catch (err) {
        console.error("Failed to save background memory:", err);
      }
    } else {
      console.log("[Memory Extractor] No new durable fact detected.");
    }
  },
});

