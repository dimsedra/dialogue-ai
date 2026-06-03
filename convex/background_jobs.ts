"use node";
import { internalAction, action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import mammoth from "mammoth";
import { runChatEngine, executeChatFollowUp, PROVIDER_CAPABILITIES, runSimpleTask, getTaskProviderAndModel } from "./ai_providers";
import { getLocalDateString, getTodayBounds } from "./timezones";

function isMultimodalProvider(provider: string): boolean {
  return PROVIDER_CAPABILITIES[provider]?.multimodal ?? false;
}

async function getEmbedding(geminiApiKey: string, text: string): Promise<number[]> {
  const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
  const { embedding: rawVector } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: text,
  });
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
  geminiApiKey: string,
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
    const embedding = await getEmbedding(geminiApiKey, text);
    await ctx.runMutation(api.ai.saveMemory, {
      text,
      embedding,
      userId: resolvedUserId,
      hash,
      updatedAt: Date.now(),
    });
    return { status: "updated", id: existingMemory._id };
  }

  const embedding = await getEmbedding(geminiApiKey, text);

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

  // Cap endMs to current time for weekly/monthly (avoid future data)
  // For yearly, keep the full Dec 31 end to cover the entire year
  if (type !== "yearly") {
    const currentRealTimeMs = Date.now();
    if (endMs > currentRealTimeMs) {
      endMs = currentRealTimeMs;
    }
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

export const generateSessionTitle = internalAction({
  args: { sessionId: v.id("chatSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};

    const { provider, modelId } = getTaskProviderAndModel(profile, "title");

    const messages = await ctx.runQuery(api.messages.list, { sessionId: args.sessionId, userId: args.userId });
    if (!messages || messages.length === 0) return;

    const transcript = messages.map((m: any) => `${m.author}: ${m.text}`).join("\n");

    const prompt = `Based on the following conversation transcript, detect the primary language used and generate a very short, creative, and descriptive title in that exact same language (maximum 3-4 words). Output ONLY the title without any introductory text.
    Do not use quotes, punctuation, or special characters.
    Transcript:
    ${transcript}`;

    let title = "";
    try {
      title = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      title = title.trim().replace(/["']/g, '');
    } catch (err) {
      console.error("Failed to generate session title:", err);
      return;
    }

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

    const { provider, modelId } = getTaskProviderAndModel(profile, "title");

    const now = new Date();
    if (args.timezoneOffset !== undefined) {
      now.setMinutes(now.getMinutes() - args.timezoneOffset);
    }
    const nowISO = now.toISOString();

    const prompt = `Convert this natural language date to an ISO-8601 string. 
Current time: ${nowISO}
Input: "${args.text}"
Respond ONLY with the ISO-8601 string or "null" if invalid.`;

    let responseText = "";
    try {
      responseText = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      responseText = responseText.trim();
    } catch (err) {
      console.error("Failed to parse date:", err);
      return null;
    }

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
    await saveSemanticMemoryInternal(ctx, apiKey, args.text, args.userId);
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

    const offset = (args.type === "weekly" || args.type === "monthly") ? 1 : 0;
    
    const { startMs, endMs } = getPeriodRange(args.type, offset, timezoneOffset);
    const periodLabel = getPeriodLabel(args.type, startMs, timezoneOffset);

    const stats = await ctx.runQuery(api.reflections.compileReflectionStats, {
      type: args.type,
      periodStart: startMs,
      periodEnd: endMs,
      userId: args.userId
    });

    if (!stats) return;

    const { provider, modelId } = getTaskProviderAndModel(profile, "reflection");
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

    let summaryText = "";
    try {
      summaryText = await runSimpleTask({
        provider,
        customConfigs,
        prompt: summaryPrompt,
        modelId,
      });
    } catch (err) {
      console.error("Failed to generate reflection summary:", err);
      return;
    }

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
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};

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
    const profileDoc = await ctx.runQuery(api.ocean_queries.getUserProfileForOCEAN, {
      userId: args.userId,
    });

    const monthlyDigest = (profileDoc?.monthlyNotesSummaries?.[0]) || "No monthly baseline yet.";

    // Build week label
    const weekLabelDate = new Date(localMonday);
    const weekLabel = `Week of ${weekLabelDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    const { provider, modelId } = getTaskProviderAndModel(profile, "reflection");

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

    let digest = "";
    try {
      digest = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      digest = digest.trim();
    } catch (err) {
      console.error("Failed to generate weekly OCEAN digest:", err);
      return;
    }

    // Compute weekStartStr for the previous week's Monday
    const weekStartStr = new Date(prevWeekStart).toLocaleDateString("en-CA", { timeZone: args.timezone });

    // Check if digest already exists for this week (idempotent)
    const existing = await ctx.runQuery(api.ocean_queries.getWeeklyDigestByWeek, {
      userId: args.userId,
      weekStart: prevWeekStart,
    });
    if (existing) return;

    // Save to weeklyDigests
    await ctx.runMutation(api.ocean_queries.insertWeeklyDigest, {
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
    const customConfigs = (profile?.preferences as any)?.customConfigs || {};

    // Get the 4 most recent weekly digests
    const weeklies = await ctx.runQuery(api.ocean_queries.getWeeklyDigestsForMonthly, {
      userId: args.userId,
    });

    if (weeklies.length === 0) return;

    // Get existing profile for baseline comparison
    const profileDoc = await ctx.runQuery(api.ocean_queries.getUserProfileForOCEAN, {
      userId: args.userId,
    });

    const existingProfile = profileDoc?.behavioralProfile || "No existing behavioral profile.";

    const { provider, modelId } = getTaskProviderAndModel(profile, "reflection");

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

    let monthlyDigest = "";
    try {
      monthlyDigest = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      monthlyDigest = monthlyDigest.trim();
    } catch (err) {
      console.error("Failed to generate monthly OCEAN digest:", err);
      return;
    }

    // 1. Archive the 4 weekly digests
    for (const weekly of weeklies) {
      await ctx.runMutation(api.ocean_queries.insertArchivedSummary, {
        userId: args.userId,
        type: "weekly",
        originalDate: weekly.weekStart,
        originalDateStr: weekly.weekStartStr || new Date(weekly.weekStart).toLocaleDateString("en-CA", { timeZone: tz }),
        content: weekly.digest,
      });
      await ctx.runMutation(api.ocean_queries.deleteWeeklyDigest, {
        id: weekly._id,
      });
    }

    // 2. Archive previous monthly digest if exists
    if (profileDoc?.monthlyNotesSummaries?.[0]) {
      await ctx.runMutation(api.ocean_queries.insertArchivedSummary, {
        userId: args.userId,
        type: "monthly",
        originalDate: Date.now(),
        originalDateStr: new Date().toLocaleDateString("en-CA", { timeZone: tz }),
        content: profileDoc.monthlyNotesSummaries[0],
      });
    }

    // 3. Update profile with new monthly digest and behavioral profile
    await ctx.runMutation(api.ocean_queries.updateUserProfileOCEAN, {
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

    const { provider, modelId } = getTaskProviderAndModel(profile, "memory");

    let extractedFact = "";
    try {
      extractedFact = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      extractedFact = extractedFact.trim();
    } catch (err) {
      console.error("Failed to run background memory extraction model:", err);
      return;
    }

    if (extractedFact && extractedFact.toLowerCase() !== "null") {
      console.log(`[Memory Extractor] Extracted new fact: "${extractedFact}"`);
      try {
        const saveResult = await saveSemanticMemoryInternal(ctx, geminiApiKey, extractedFact, userId);
        console.log(`[Memory Extractor] Save result:`, saveResult);
      } catch (err) {
        console.error("Failed to save background memory:", err);
      }
    } else {
      console.log("[Memory Extractor] No new durable fact detected.");
    }
  },
});

export const generateDailySummary = internalAction({
  args: {
    userId: v.id("users"),
    timezone: v.string(),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.ai.getProfile, { userId: args.userId, revealKeys: true });
    const dateString = getLocalDateString(args.timezone);
    const { start: startOfDay, end: endOfDay } = getTodayBounds(args.timezone);

    const existing = await ctx.runQuery(internal.dailySummary.getSessionSummaryByDate, {
      userId: args.userId,
      date: dateString,
    });
    if (existing) return;

    const sessions = await ctx.runQuery(internal.dailySummary.getUserSessions, {
      userId: args.userId,
    });

    const userMessages: { text: string; timestamp: number }[] = [];
    for (const session of sessions) {
      const messages = await ctx.runQuery(internal.dailySummary.getMessagesBySession, {
        sessionId: session._id,
        startOfDay,
        endOfDay,
      });
      for (const msg of messages) {
        userMessages.push({ text: msg.text, timestamp: msg.timestamp });
      }
    }

    userMessages.sort((a, b) => a.timestamp - b.timestamp);

    if (userMessages.length === 0) {
      await ctx.runMutation(internal.dailySummary.insertSessionSummary, {
        userId: args.userId,
        date: dateString,
        summary: "No activity.",
      });
      return;
    }

    const customConfigs = (profile?.preferences as any)?.customConfigs || {};
    const { provider, modelId } = getTaskProviderAndModel(profile, "reflection");
    const messagesText = userMessages.map((m) => m.text).join("\n---\n");

    const prompt = `You are a behavioral analyst for a productivity app. Read the user's messages from today and write a 2-line session summary that captures behavioral signals relevant to the Big 5 (OCEAN) personality traits. Do not explain the reasoning, just output the summary.

Messages:
${messagesText}`;

    let summary = "";
    try {
      summary = await runSimpleTask({
        provider,
        customConfigs,
        prompt,
        modelId,
      });
      summary = summary.trim();
    } catch (err) {
      console.error("Failed to generate daily summary:", err);
      return;
    }

    await ctx.runMutation(internal.dailySummary.insertSessionSummary, {
      userId: args.userId,
      date: dateString,
      summary,
    });
  },
});

