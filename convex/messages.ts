import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: { 
    sessionId: v.optional(v.id("chatSessions")),
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    if (!args.sessionId) return [];
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
      .collect();
  },
});

export const listSessions = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) return [];

      return await ctx.db
        .query("chatSessions")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("userId"), userId))
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getSession = query({
  args: { id: v.id("chatSessions"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== userId) return null;
    return session;
  },
});

export const createSession = mutation({
  args: { 
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces"))
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) throw new Error("Unauthorized");
    }

    return await ctx.db.insert("chatSessions", {
      userId,
      title: args.title || "New Chat",
      workspaceId: args.workspaceId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  },
});

export const deleteSession = mutation({
  args: { id: v.id("chatSessions"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const session = await ctx.db.get(args.id);
    if (!session) return; // If already deleted, idempotent success
    if (session.userId !== userId) throw new Error("Unauthorized");

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
  args: { id: v.id("chatSessions"), title: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const session = await ctx.db.get(args.id);
    if (!session) return; // If doesn't exist, idempotent return
    if (session.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const updateSessionTitle = internalMutation({
  args: { id: v.id("chatSessions"), title: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== args.userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { title: args.title });
  },
});

const sendArgs = { 
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
};

export const send = mutation({
  args: sendArgs,
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized");

    const messageId = await sendImplementation(ctx, args);

    if (args.author !== "AI" && args.provider !== "lmstudio") {
      await ctx.scheduler.runAfter(0, internal.ai_action.chat, { 
        sessionId: args.sessionId, 
        userId: userId!,
        messageId,
        text: args.text, 
        author: args.author, 
        timezoneOffset: args.timezoneOffset, 
        brief: args.brief,
        storageId: args.storageId,
        fileName: args.fileName,
        fileType: args.fileType,
        attachments: args.attachments,
      });
    }

    return messageId;
  },
});

export const internalSend = internalMutation({
  args: sendArgs,
  handler: async (ctx, args) => {
    return await sendImplementation(ctx, args);
  },
});

async function sendImplementation(ctx: MutationCtx, args: {
  sessionId: Id<"chatSessions">;
  text: string;
  author: string;
  timezoneOffset?: number;
  toolCall?: { name: string; args: Record<string, unknown>; result?: unknown };
  storageId?: Id<"_storage">;
  fileType?: string;
  fileName?: string;
  attachments?: { storageId: Id<"_storage">; fileName: string; fileType: string }[];
}) {
  const { sessionId, text, author, timezoneOffset, toolCall, storageId, fileType, fileName, attachments } = args;
  
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
  return messageId;
}

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
