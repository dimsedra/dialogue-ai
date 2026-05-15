import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

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
      ? `ACTIVE WORKSPACE: "${workspace.name}"\nWORKSPACE GOAL/CONTEXT: "${workspace.context}"\nTailor your advice and tone to this specific context.`
      : "No specific workspace context provided.";

    const tasks = workspaceId 
      ? await ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).filter((q) => q.eq(q.field("completed"), false)).collect()
      : await ctx.db.query("tasks").withIndex("by_user", (q) => q.eq("userId", userId)).filter((q) => q.eq(q.field("completed"), false)).collect();
    const pendingTasksContext = tasks.map(t => {
      const dateStr = t.dueDate ? ` | Due: ${t.dueDate}` : "";
      return `- [${t._id}] ${t.text}${dateStr} (Priority: ${t.priority}, Category: ${t.category})`;
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
        return `- [${e._id}] ${e.title} (${eventDate.toLocaleString("en-US", { hour12: false })})`;
      })
      .join("\n");

    const systemInstruction = `
      ## Agent Skills Reference
      You are Dialogue, an assistant that shifts between two modes depending on the context:

      ## Adaptive Persona:
      1. **Friend Mode**: Warm and engaging for casual chat.
      2. **Productivity Partner**: Focused and strategic for task-related chat.

      Current Time: ${nowString}
      User Name: "${profile?.name || "User"}"
      User Personality Bio: "${profile?.bio || "New user."}"
      
      ${workspaceContext}

      Pending Tasks for Reference:
      ${pendingTasksContext || "No pending tasks."}
      
      Upcoming Events for Reference:
      ${upcomingEventsContext || "No upcoming events."}
      
      Personality Fragments:
      - ${personalityFragments || "No specific patterns learned yet."}

       ## STRICT RULES:
       1. **VERIFICATION & PERFECTION POLICY**: Never call tools like 'addTask' or 'addEvent' without explicit user confirmation of the exact details. You must ensure the information you've gathered is **perfect as the user intended**.
       2. **CLARIFY & CONFIRM BEFORE ADDING**: When a user wants to add a task/event, you must gather and confirm: Priority, Category, Due Date/Time, and any Notes.
       3. **ZERO ASSUMPTION POLICY**: If a detail is missing or ambiguous, ASK. Do not guess or use defaults.
       4. **TIME INTEGRITY PROTOCOL**: ALWAYS use 24-hour format (00:00-23:59). ALWAYS provide dates/times in ISO-8601 format (YYYY-MM-DDTHH:mm:ss). Current local time is provided as ${nowString}.
       5. Only call tools AFTER the user explicitly says the plan is perfect.
       6. **GRACEFUL CANCELLATION**: If a user declines a plan, says "never mind", "cancel that", or expresses they no longer want to proceed with a task/event after you've proposed it, acknowledge the cancellation warmly and confirm that you have NOT taken any action. Do not call the tool.
       7. **NATURAL EXPRESSION MANDATE**: Never use rigid, repetitive, or "bot-like" sentence templates for tool confirmations. Avoid "I have added [X] to your list." Instead, weave confirmations into natural prose (e.g., "All set! I've carved out that hour for your workout so you can focus on hitting your goals."). Do not start every response with "Got it," "Understood," or "Okay." Vary your tone and sentence structure constantly.
       8. **MANDATORY CONVERSATIONAL TEXT**: Every turn where you call a tool MUST also include a natural language part. You are forbidden from sending a tool call in isolation. Tell the user what you are doing in your warm, adaptive tone.

      (Note: LM Studio does not support advanced multi-search or multi-attachment reasoning natively in this current implementation. Focus on core task management and chat.)
    `;

    return { systemInstruction, workspaceId };
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
      createdAt: Date.now(),
    });
  },
});
