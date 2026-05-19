import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

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
- **Acknowledge Attachments**: If uploaded, acknowledge files naturally.
- **Reason Across Files**: Compare documents, identify image patterns, and synthesize multi-source information simultaneously.
- **Contextual Planning**: Use file content to inform task suggestions.

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
- Purpose: Use ONLY AFTER verification to modify or reschedule a single day/occurrence of a recurring series. Provide seriesId and originalStartTime. Explain clearly during confirmation that ONLY this specific date was modified.
### searchWeb
- Purpose: Use to search the web for real-time info, facts, documentation, or background context.
- THE DIALOGUE VERIFICATION PRINCIPLE:
  1. You MUST call this tool immediately if the user mentions specific entities, terminology, tools, concepts, or events that are new, outside your training data, or not fully defined in your system context.
  2. If there is ANY ambiguity, uncertainty, or doubt in the user's intent, or if you lack complete/accurate context to address the query precisely, you MUST prioritize verification via searchWeb over assumption.
  3. It is always better to confirm facts and verify context first rather than responding with generic answers or potential hallucinations.
  4. You are authorized to run multiple search queries in a single turn if broad research is required to synthesize a comprehensive and highly accurate response.
### updateMemory
- Purpose: Use when you learn new, stable patterns about the user's personality or preferences.

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

export const getPromptContext = query({
  args: {
    sessionId: v.id("chatSessions"),
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
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

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    const personalityFragments = memories.map(m => m.text).join("\n- ");

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

    const tasks = workspaceId 
      ? await ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).filter((q) => q.eq(q.field("completed"), false)).collect()
      : await ctx.db.query("tasks").withIndex("by_user", (q) => q.eq("userId", userId)).filter((q) => q.eq(q.field("completed"), false)).collect();
    const pendingTasksContext = tasks.map(t => {
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
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })}) [Type: ${e.eventType || "interval"}]${hookStr}${outcomeStr}${notesStr}`;
      })
      .join("\n");

    let briefingContext = "";
    if (args.brief) {
      briefingContext = `
      USER REQUESTED A WORKSPACE SYNC.
      Current Time: ${nowString}
      Pending Tasks: ${JSON.stringify(tasks)}
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

export const saveMemory = mutation({
  args: { text: v.string(), embedding: v.array(v.number()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");
    await ctx.db.insert("memories", { 
      userId, 
      text: args.text, 
      embedding: args.embedding 
    });
  },
});

export const getProfile = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;
    return await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const updateProfile = mutation({
  args: { name: v.optional(v.string()), bio: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      await ctx.db.patch(profile._id, { name: args.name, bio: args.bio });
    } else {
      await ctx.db.insert("userProfile", { 
        userId, 
        name: args.name, 
        bio: args.bio, 
        preferences: {} 
      });
    }
  },
});

export const updatePreferences = mutation({
  args: { 
    provider: v.optional(v.union(v.literal("gemini"), v.literal("lmstudio"))),
    searchProvider: v.optional(v.union(v.literal("tavily"), v.literal("serper"))),
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      const preferences = (profile.preferences as Record<string, unknown>) || {};
      await ctx.db.patch(profile._id, {
        preferences: { 
          ...preferences, 
          ...(args.provider ? { provider: args.provider } : {}),
          ...(args.searchProvider ? { searchProvider: args.searchProvider } : {})
        }
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId,
        bio: "",
        preferences: { 
          ...(args.provider ? { provider: args.provider } : { provider: "gemini" }),
          ...(args.searchProvider ? { searchProvider: args.searchProvider } : { searchProvider: "tavily" })
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
      contextUpdatedAt: (args.notes || args.progress !== undefined || args.statusHook) ? Date.now() : undefined,
      createdAt: Date.now(),
    });
  },
});
