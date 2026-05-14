import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: { sessionId: v.optional(v.id("chatSessions")) },
  handler: async (ctx, args) => {
    if (!args.sessionId) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
      .collect();
  },
});

export const listSessions = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    if (args.workspaceId) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("chatSessions").order("desc").collect();
  },
});

export const getSession = query({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createSession = mutation({
  args: { 
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces"))
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatSessions", {
      title: args.title || "New Chat",
      workspaceId: args.workspaceId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  },
});

export const deleteSession = mutation({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const renameSession = mutation({
  args: { id: v.id("chatSessions"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const updateSessionTitle = mutation({
  args: { id: v.id("chatSessions"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const send = mutation({
  args: { 
    sessionId: v.id("chatSessions"),
    text: v.string(), 
    author: v.string(), 
    timezoneOffset: v.optional(v.number()),
    brief: v.optional(v.boolean()),
    provider: v.optional(v.union(v.literal("gemini"), v.literal("lmstudio"))),
    toolCall: v.optional(v.object({
      name: v.string(),
      args: v.any(),
      result: v.optional(v.any()),
    })),
  },
  handler: async (ctx, { sessionId, text, author, timezoneOffset, brief, provider, toolCall }) => {
    await ctx.db.insert("messages", {
      sessionId,
      text,
      author,
      timestamp: Date.now(),
      timezoneOffset,
      toolCall,
    });

    await ctx.db.patch(sessionId, { lastActivity: Date.now() });

    if (author !== "AI" && provider !== "lmstudio") {
      await ctx.scheduler.runAfter(0, internal.ai.chat, { sessionId, text, author, timezoneOffset, brief });
    }
  },
});
