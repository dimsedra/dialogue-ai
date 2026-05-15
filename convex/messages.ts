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
    storageId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileType: v.string(),
    }))),
  },
  handler: async (ctx, { sessionId, text, author, timezoneOffset, brief, provider, toolCall, storageId, fileType, fileName, attachments }) => {
    const messageId = await ctx.db.insert("messages", {
      sessionId,
      text,
      author,
      timestamp: Date.now(),
      timezoneOffset,
      toolCall,
      storageId,
      fileType,
      fileName,
      attachments,
    });

    await ctx.db.patch(sessionId, { lastActivity: Date.now() });

    if (author !== "AI" && provider !== "lmstudio") {
      await ctx.scheduler.runAfter(0, internal.ai_action.chat, { 
        sessionId, 
        messageId,
        text, 
        author, 
        timezoneOffset, 
        brief,
        storageId,
        fileName,
        fileType,
        attachments: attachments,
      });
    }
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const getFileMetadata = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    // Try legacy field first
    const legacyMessage = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("storageId"), args.storageId))
      .first();
    
    if (legacyMessage) {
      return {
        fileName: legacyMessage.fileName,
        fileType: legacyMessage.fileType,
      };
    }

    // Search in attachments array
    const messages = await ctx.db
      .query("messages")
      .filter((q) => 
        q.neq(q.field("attachments"), undefined)
      )
      .collect();
    
    for (const msg of messages) {
      const att = msg.attachments?.find(a => a.storageId === args.storageId);
      if (att) return att;
    }
    
    return null;
  },
});
