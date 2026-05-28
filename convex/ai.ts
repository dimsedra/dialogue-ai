import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { encrypt, decrypt } from "./encryption";
import { recentActivityFeedHandler } from "./notes";

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
- Purpose: Use ONLY AFTER verification to modify an existing standalone event or update ALL occurrences of an entire recurring series. Provide only the fields that need modification. Set cancelled to true to cancel an event without deleting it.
### updateEventOccurrence
- Purpose: Use ONLY AFTER verification to modify or reschedule a single day/occurrence of a recurring series (e.g., 'move Tuesday gym to 8am', 'cancel this Saturday'). Provide seriesId and originalStartTime. Set cancelled to true to cancel this specific occurrence. Explain clearly during confirmation that ONLY this specific date was modified.
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
- Mandatory Skip Rule (Triviality Gate): Do NOT call this tool for trivial, short-term, redundant, or purely conversational banter (e.g. user says "Thanks!", "I agree", "That makes sense", "Nice", or repeats a fact already saved in memories).
- Exemption: This tool is strictly EXEMPT from the Verification Protocol. You do not need the user's permission or confirmation to save a memory; call it silently and instantly during the turn.
### deleteSemanticMemory
- Purpose: Delete a specific long-term semantic memory/fact if the user explicitly corrects a previously remembered fact or requests that it be forgotten.
- Verification Protocol: You MUST ask for confirmation/verification before calling this tool, unless the user's message is an explicit instruction to delete/forget it (e.g., "Forget that I have a cat").
### triggerReflection
- Purpose: Use to trigger a Spotify-Wrapped style periodic reflection summary of the user's tasks, events, categories, and streaks over a specific period. Use when the user asks how they are doing, requests a summary/reflection of their week/month/year, or says "How is my week going?"
- Parameters:
  * type: "weekly", "monthly", or "yearly".
  * offsetWeeks, offsetMonths, offsetYears: number (optional, default 0 for current week/month/year. Use positive numbers to look back in history).
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
### compileNotesPyramid
- Purpose: Compiles a weekly or monthly notes pyramid segment to distill behavioral patterns from user notes.
- Parameters:
  * segment: number (optional, the split-week segment 1, 2, 3, 4).
  * timezoneOffset: number (optional, timezone offset in minutes).

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

export const getPromptContext = query({
  args: {
    sessionId: v.id("chatSessions"),
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
    scope: v.optional(v.object({
      type: v.string(),
      id: v.string(),
      title: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return { systemInstruction: "Unauthorized", workspaceId: null };

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return { systemInstruction: "Unauthorized", workspaceId: null };

    const workspaceId = session?.workspaceId;

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const personalityFragments = "";

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
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short', hour12: false
      });
    }

    const workspace = workspaceId ? await ctx.db.get(workspaceId) : null;
    const workspaceContext = workspace?.context
      ? `ACTIVE WORKSPACE: "${workspace.name}"\nWORKSPACE CONTEXT/RULES: "${workspace.context}"\n(Reminder: This context takes precedence over your default persona)`
      : "No specific workspace context provided. Follow your default adaptive persona.";

    const scopeContext = args.scope
      ? `ACTIVE SCOPE (PINNED CONTEXT):\nThe user has explicitly pinned the following item to this chat message:\n[${args.scope.type.toUpperCase()}] ${args.scope.title} (ID: ${args.scope.id})\n\nCRITICAL INSTRUCTION: When answering or executing tool calls for this query, ALWAYS prioritize this specific pinned context. If the user says "this", "reschedule this", "mark this done", etc., they are referring directly to this pinned active scope!`
      : "";

    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const allTasks = workspaceId 
      ? await ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).filter((q) => q.or(q.eq(q.field("completed"), false), q.gte(q.field("completedAt"), fortyEightHoursAgo))).collect()
      : await ctx.db.query("tasks").withIndex("by_user", (q) => q.eq("userId", userId)).filter((q) => q.or(q.eq(q.field("completed"), false), q.gte(q.field("completedAt"), fortyEightHoursAgo))).collect();

    const priorityWeight: Record<string, number> = { high: 1, medium: 2, low: 3 };
    const pendingTasks = allTasks.filter((t) => !t.completed);
    const completedTasks = allTasks.filter((t) => t.completed);

    const sortedPendingTasks = [...pendingTasks].sort((a, b) => {
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

    const formatResources = (resources: { title: string; type: string; url?: string; summary?: string }[] | undefined) => {
      if (!resources || resources.length === 0) return "";
      const summary = resources.map(r => `    - ${r.type === "url" ? "URL" : "File"}: "${r.title}" (${r.url || ""})${r.summary ? ` — ${r.summary}` : ""}`).join("\n");
      return `\n  Resources (${resources.length}):\n${summary}`;
    };

    const getRolling7Days = (todayStr: string) => {
      const [y, m, d] = todayStr.split("-").map(Number);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(y, m - 1, d);
        dt.setDate(d - i);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        dates.push(`${yyyy}-${mm}-${dd}`);
      }
      return dates;
    };

    const pendingTasksContext = sortedPendingTasks.map(t => {
      const dateStr = t.dueDate ? ` | Due: ${formatTaskDate(t.dueDate)}` : "";
      const progressStr = t.progress !== undefined ? ` | Progress: ${t.progress}%` : "";
      const hookStr = t.statusHook ? ` | Hook: "${t.statusHook}"` : "";
      const notesStr = t.notes ? `\n  Notes:\n  ${t.notes.split("\n").join("\n  ")}` : "";
      const resourcesStr = formatResources(t.resources);
      return `- [${t._id}] ${t.text}${dateStr}${progressStr}${hookStr} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"})${notesStr}${resourcesStr}`;
    }).join("\n");

    const sortedCompletedTasks = [...completedTasks].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const completedTasksContext = sortedCompletedTasks.map(t => {
      const createdStr = `Created: ${formatTaskDate(t._creationTime)}`;
      const dueStr = t.dueDate ? `, Due: ${formatTaskDate(t.dueDate)}` : "";
      const completedStr = t.completedAt ? `, Completed: ${formatTaskDate(t.completedAt)}` : "";
      const notesStr = t.notes ? `\n  Notes:\n  ${t.notes.split("\n").join("\n  ")}` : "";
      const resourcesStr = formatResources(t.resources);
      return `- [${t._id}] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}${completedStr}]${notesStr}${resourcesStr}`;
    }).join("\n");

    const events = workspaceId
      ? await ctx.db.query("events").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()
      : await ctx.db.query("events").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const upcomingEventsContext = events
      .filter(e => e.startTime > Date.now() - 3600000)
      .map(e => {
        const eventDate = args.timezoneOffset !== undefined
          ? new Date(e.startTime - (args.timezoneOffset * 60000))
          : new Date(e.startTime);
        const hookStr = e.statusHook ? ` | Hook: "${e.statusHook}"` : "";
        const outcomeStr = e.outcome ? ` | Outcome: "${e.outcome}"` : "";
        const notesStr = e.notes ? `\n  Notes:\n  ${e.notes.split("\n").join("\n  ")}` : "";
        const resourcesStr = formatResources(e.resources);
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })}) [Type: ${e.eventType || "interval"}]${hookStr}${outcomeStr}${notesStr}${resourcesStr}`;
      })
      .join("\n");

    const activeHabits = workspaceId
      ? await ctx.db.query("habits").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()
      : await ctx.db.query("habits").withIndex("by_user", (q) => q.eq("userId", userId)).collect();

    const nonArchivedHabits = activeHabits.filter(h => !h.archived);

    let todayDateString = "";
    if (args.timezoneOffset !== undefined) {
      const now = new Date();
      const localTime = new Date(now.getTime() - (args.timezoneOffset * 60000));
      todayDateString = `${localTime.getFullYear()}-${String(localTime.getMonth() + 1).padStart(2, "0")}-${String(localTime.getDate()).padStart(2, "0")}`;
    } else {
      const now = new Date();
      todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    const habitsContextLines = await Promise.all(nonArchivedHabits.map(async (h) => {
      const todayLog = await ctx.db
        .query("habitLogs")
        .withIndex("by_habit_dateString", (q) => q.eq("habitId", h._id).eq("dateString", todayDateString))
        .unique();
      const statusStr = todayLog ? `Today: ${todayLog.status.toUpperCase()}` : "Today: PENDING (Not logged yet)";
      const schedStr = h.frequency === "daily" ? "Daily" : `Days: [${h.frequencyConfig?.daysOfWeek?.join(",")}]`;
      const lastLoggedStr = h.lastLoggedDate ? ` | Last Logged: ${h.lastLoggedDate}` : "";

      // Fetch the logs for the current habit to compute the weekly rate
      const logs = await ctx.db
        .query("habitLogs")
        .withIndex("by_habit", (q) => q.eq("habitId", h._id))
        .order("desc")
        .take(30);

      const last7Days = getRolling7Days(todayDateString);
      let completedCount = 0;
      let scheduledCount = 0;

      for (const dateStr of last7Days) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        const dayOfWeek = dt.getDay();

        let isScheduled = true;
        if (h.frequency === "custom" && h.frequencyConfig?.daysOfWeek) {
          isScheduled = h.frequencyConfig.daysOfWeek.includes(dayOfWeek);
        }

        if (isScheduled) {
          scheduledCount++;
          const log = logs.find((l) => l.dateString === dateStr);
          if (log && log.status === "completed") {
            completedCount++;
          }
        }
      }

      const weeklyRate = scheduledCount > 0
        ? Math.round((completedCount / scheduledCount) * 100)
        : 0;

      return `- [${h._id}] "${h.name}" (${schedStr}) | Current Streak: ${h.currentStreak} day(s) (Longest: ${h.longestStreak}d), Weekly Rate: ${weeklyRate}% (${completedCount}/${scheduledCount} Completed) | ${statusStr}${lastLoggedStr}`;
    }));
    const habitsContext = habitsContextLines.join("\n");

    // Fetch Note-Scan data
    const weeklySummaries = profile?.weeklyNotesSummaries ?? [];
    const monthlySummaries = profile?.monthlyNotesSummaries ?? [];
    const behavioralProfile = profile?.behavioralProfile ?? "";

    const weeklySummariesContext = weeklySummaries.length > 0
      ? weeklySummaries.map((s, i) => `Week ${i + 1}:\n${s}`).join("\n\n")
      : "No recent weekly summaries.";

    const monthlySummariesContext = monthlySummaries.length > 0
      ? monthlySummaries.map((s, i) => `Month ${i + 1}:\n${s}`).join("\n\n")
      : "No recent monthly summaries.";

    const notesTimeline = await recentActivityFeedHandler(ctx, { userId });
    const timelineContext = notesTimeline.length > 0
      ? notesTimeline.map((item: any) => `[${item.date}] [${item.entityType.toUpperCase()}] ${item.entityName} (${item.workspaceName || "No Workspace"}): ${item.noteText}`).join("\n")
      : "No raw notes recorded in the last 7 days.";

    let briefingContext = "";
    if (args.brief) {
      briefingContext = `
      USER REQUESTED A WORKSPACE SYNC.
      Current Time: ${nowString}
      Pending Tasks: ${JSON.stringify(sortedPendingTasks)}
      Upcoming Calendar Events: ${JSON.stringify(events)}
      
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

    let personaName = "Dialogue";
    let personaPrompt = "You build relationships through concrete behaviors, not prescribed tones.";
    if (session?.agentPersonaId) {
      const persona = await ctx.db.get(session.agentPersonaId);
      if (persona && persona.userId === userId) {
        personaName = persona.name;
        personaPrompt = persona.prompt;
      }
    }

    const systemInstruction = `
      You are ${personaName}. ${personaPrompt}

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

      --- BEHAVIORAL PATTERNS (Observed, Not Stated) ---
      ${behavioralProfile ? `Permanent Profile: ${behavioralProfile}` : "Not enough data yet."}
      ${monthlySummariesContext ? `Monthly Trends: ${monthlySummariesContext}` : ""}
      ${weeklySummariesContext ? `Weekly Themes: ${weeklySummariesContext}` : ""}
      ${timelineContext ? `Recent Raw Notes (7 days): ${timelineContext}` : ""}
      
      These are patterns distilled from the user's journals — task notes, event outcomes, habit logs. Use them to adapt your tone and suggestions.
      The behavioral profile is a current-best-guess sketch refined monthly, not a fixed truth. Recent raw notes reflect the user's current context — they may show temporary deviations (vacation, crunch) or genuine shifts (new habits, lifestyle changes). Use both sources together. If raw notes and the profile conflict consistently across multiple sessions, the notes are more likely to reflect who the user is today. NEVER state a pattern to the user as if they told you it. If they ask "why do you always suggest X?", THEN you may cite these observations.

      --- RELEVANT FACTS (Mentioned in Past Chats) ---
      ${personalityFragments ? `- ${personalityFragments}` : "No relevant facts found."}
      
      These are things the user has mentioned before. They may be outdated or change without notice. If the user contradicts a fact, ignore the old fact and adapt to what they say now.
      
      (Note: Local LLM mode supports tool execution and web search. Attachment reasoning across files is subject to your local model vision capabilities.)
    `;

    return { systemInstruction, workspaceId, timezoneOffset: args.timezoneOffset };
  }
});

export const getLatestMemories = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];
    return await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(3);
  },
});

export const getMemoryById = query({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getMemoryByHash = query({
  args: { hash: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;
    return await ctx.db
      .query("memories")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
  },
});

export const saveMemory = mutation({
  args: { 
    text: v.string(), 
    embedding: v.array(v.number()), 
    userId: v.optional(v.id("users")),
    hash: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const now = Date.now();
    const createdAt = args.createdAt ?? now;
    const updatedAt = args.updatedAt ?? now;

    if (args.hash) {
      const existing = await ctx.db
        .query("memories")
        .withIndex("by_hash", (q) => q.eq("hash", args.hash))
        .filter((q) => q.eq(q.field("userId"), userId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          text: args.text,
          embedding: args.embedding,
          updatedAt,
        });
        return existing._id;
      }
    }

    return await ctx.db.insert("memories", { 
      userId, 
      text: args.text, 
      embedding: args.embedding,
      hash: args.hash,
      createdAt,
      updatedAt,
    });
  },
});

export const getProfile = query({
  args: { userId: v.optional(v.id("users")), revealKeys: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;
    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
      
    if (profile && profile.preferences) {
      const prefs = profile.preferences as Record<string, any>;
      if (prefs.customConfigs) {
        const safeConfigs = JSON.parse(JSON.stringify(prefs.customConfigs));
        for (const p of Object.keys(safeConfigs)) {
          if (safeConfigs[p]?.apiKey) {
            try {
              safeConfigs[p].apiKey = await decrypt(safeConfigs[p].apiKey);
            } catch (e: any) {
              console.error("Decryption failed for profile query:", e);
              safeConfigs[p].apiKey = `ERROR: ${e.message}`; // Surface error to UI
            }
          }
        }
        prefs.customConfigs = safeConfigs;
      }
    }
    return profile;
  },
});

export const updateProfile = mutation({
  args: { name: v.optional(v.string()), bio: v.optional(v.string()), preferences: v.optional(v.any()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.bio !== undefined) patch.bio = args.bio;
      if (args.preferences !== undefined) {
        const existingPrefs = (profile.preferences as Record<string, unknown>) || {};
        patch.preferences = { ...existingPrefs, ...args.preferences };
      }
      await ctx.db.patch(profile._id, patch);
    } else {
      await ctx.db.insert("userProfile", { 
        userId, 
        name: args.name, 
        bio: args.bio || "", 
        preferences: args.preferences || {} 
      });
    }
  },
});

export const updatePreferences = mutation({
  args: { 
    provider: v.optional(v.union(v.literal("gemini"), v.literal("lmstudio"), v.literal("openai"), v.literal("anthropic"))),
    searchProvider: v.optional(v.union(v.literal("tavily"), v.literal("serper"))),
    customConfigs: v.optional(v.any()),
    taskModels: v.optional(v.any()),
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const preferences = profile ? ((profile.preferences as Record<string, unknown>) || {}) : {};
    const existingConfigs = (preferences.customConfigs as Record<string, any>) || {};

    let processedConfigs = args.customConfigs;
    if (processedConfigs) {
      for (const p of Object.keys(processedConfigs)) {
        if (processedConfigs[p]?.apiKey) {
          try {
            processedConfigs[p].apiKey = await encrypt(processedConfigs[p].apiKey);
          } catch (e: any) {
            console.error("Encryption failed:", e);
            throw new Error("Failed to encrypt API key. Ensure ENCRYPTION_KEY is set in Convex dashboard.");
          }
        }
      }
    }

    if (profile) {
      const newConfigs = processedConfigs ? { ...existingConfigs, ...processedConfigs } : existingConfigs;

      await ctx.db.patch(profile._id, {
        preferences: { 
          ...preferences, 
          ...(args.provider ? { provider: args.provider } : {}),
          ...(args.searchProvider ? { searchProvider: args.searchProvider } : { searchProvider: "tavily" }),
          ...(args.taskModels ? { taskModels: args.taskModels } : {}),
          customConfigs: newConfigs
        }
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId,
        bio: "",
        preferences: { 
          ...(args.provider ? { provider: args.provider } : { provider: "gemini" }),
          ...(args.searchProvider ? { searchProvider: args.searchProvider } : { searchProvider: "tavily" }),
          ...(processedConfigs ? { customConfigs: processedConfigs } : {}),
          ...(args.taskModels ? { taskModels: args.taskModels } : {})
        }
      });
    }
  },
});

export const getAllMemories = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];
    return await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const updateMemoryText = mutation({
  args: { id: v.id("memories"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { text: args.text });
  },
});

export const deleteMemory = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.delete(args.id);
  },
});


export const addTask = mutation({
  args: {
    text: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    dueDate: v.optional(v.number()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    progress: v.optional(v.number()),
    statusHook: v.optional(v.string()),
    resources: v.optional(v.array(v.object({
      type: v.union(v.literal("url"), v.literal("document")),
      title: v.string(),
      url: v.string(),
      storageId: v.optional(v.id("_storage")),
      summary: v.optional(v.string()),
      linkedAt: v.number(),
    }))),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.insert("tasks", {
      userId,
      text: args.text,
      workspaceId: args.workspaceId,
      completed: false,
      dueDate: args.dueDate,
      priority: args.priority || "medium",
      category: args.category || "General",
      notes: args.notes,
      progress: args.progress,
      statusHook: args.statusHook,
      resources: args.resources,
      contextUpdatedAt: (args.notes || args.progress !== undefined || args.statusHook) ? Date.now() : undefined,
      createdAt: Date.now(),
    });
  },
});
