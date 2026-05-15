import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getPromptContext = query({
  args: {
    sessionId: v.id("chatSessions"),
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    const workspaceId = session?.workspaceId;

    const profile = await ctx.db.query("userProfile").first();
    const memories = await ctx.db.query("memories").order("desc").take(5);
    const personalityFragments = memories.map(m => m.text).join("\n- ");

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

    const workspace = workspaceId ? await ctx.db.get(workspaceId) : null;
    const workspaceContext = workspace?.context
      ? `ACTIVE WORKSPACE: "${workspace.name}"\nWORKSPACE GOAL/CONTEXT: "${workspace.context}"\nTailor your advice and tone to this specific context.`
      : "No specific workspace context provided.";

    const tasks = workspaceId 
      ? await ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).filter((q) => q.eq(q.field("completed"), false)).collect()
      : await ctx.db.query("tasks").filter((q) => q.eq(q.field("completed"), false)).collect();
    const pendingTasksContext = tasks.map(t => `- [${t._id}] ${t.text} (Priority: ${t.priority}, Category: ${t.category})`).join("\n");

    const events = workspaceId
      ? await ctx.db.query("events").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()
      : await ctx.db.query("events").collect();
    const upcomingEventsContext = events
      .filter(e => e.startTime > Date.now() - 3600000)
      .map(e => `- [${e._id}] ${e.title} (${new Date(e.startTime).toLocaleString()})`)
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

      (Note: LM Studio does not support advanced multi-search or multi-attachment reasoning natively in this current implementation. Focus on core task management and chat.)
    `;

    return { systemInstruction, workspaceId };
  }
});

export const getLatestMemories = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memories").order("desc").take(3);
  },
});

export const saveMemory = mutation({
  args: { text: v.string(), embedding: v.array(v.number()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("memories", { text: args.text, embedding: args.embedding });
  },
});

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("userProfile").first();
  },
});

export const updateProfile = mutation({
  args: { name: v.optional(v.string()), bio: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("userProfile").first();
    if (profile) {
      await ctx.db.patch(profile._id, { name: args.name, bio: args.bio });
    } else {
      await ctx.db.insert("userProfile", { name: args.name, bio: args.bio, preferences: {} });
    }
  },
});

export const updatePreferences = mutation({
  args: { 
    provider: v.optional(v.union(v.literal("gemini"), v.literal("lmstudio"))),
    searchProvider: v.optional(v.union(v.literal("tavily"), v.literal("serper")))
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("userProfile").first();
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
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memories").order("desc").collect();
  },
});

export const updateMemoryText = mutation({
  args: { id: v.id("memories"), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { text: args.text });
  },
});

export const deleteMemory = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const addTask = mutation({
  args: {
    text: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", {
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
