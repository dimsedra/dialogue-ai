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
  args: { 
    workspaceId: v.optional(v.id("workspaces")),
    allWorkspaces: v.optional(v.boolean()),
  },
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

    // allWorkspaces=true: return every session (used by Dashboard landing view)
    if (args.allWorkspaces) {
      return await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    }

    // Default (sidebar dashboard view): only workspace-agnostic sessions
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("workspaceId"), undefined))
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

    let personaName = "Dialogue";
    let personaPrompt = "You build relationships through concrete behaviors, not prescribed tones.";

    if (session.agentPersonaId) {
      const persona = await ctx.db.get(session.agentPersonaId);
      if (persona && persona.userId === userId) {
        personaName = persona.name;
        personaPrompt = persona.prompt;
      }
    }

    return {
      ...session,
      personaName,
      personaPrompt,
    };
  },
});

export const createSession = mutation({
  args: { 
    title: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    agentPersonaId: v.optional(v.id("agentPersonas")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    let agentPersonaId = args.agentPersonaId;

    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) throw new Error("Unauthorized");
      if (!agentPersonaId && workspace.defaultAgentPersonaId) {
        agentPersonaId = workspace.defaultAgentPersonaId;
      }
    }

    if (agentPersonaId) {
      const persona = await ctx.db.get(agentPersonaId);
      if (!persona || persona.userId !== userId) throw new Error("Unauthorized");
    }

    return await ctx.db.insert("chatSessions", {
      userId,
      title: args.title || "New Chat",
      workspaceId: args.workspaceId,
      agentPersonaId,
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
  timezone: v.optional(v.string()),  // IANA timezone (e.g. "Asia/Jakarta")
  brief: v.optional(v.boolean()),
  provider: v.optional(v.union(v.literal("gemini"), v.literal("lmstudio"), v.literal("openai"), v.literal("anthropic"))),
  toolCall: v.optional(v.object({
    name: v.string(),
    args: v.any(),
    result: v.optional(v.any()),
  })),
  toolCalls: v.optional(v.array(v.object({
    name: v.string(),
    args: v.any(),
    result: v.optional(v.any()),
  }))),
  storageId: v.optional(v.id("_storage")),
  fileType: v.optional(v.string()),
  fileName: v.optional(v.string()),
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
        timezone: args.timezone,
        timezoneOffset: args.timezoneOffset, 
        brief: args.brief,
        storageId: args.storageId,
        fileName: args.fileName,
        fileType: args.fileType,
        attachments: args.attachments,
        scope: args.scope,
      });
    }

    if (args.author === "User") {
      await ctx.scheduler.runAfter(0, internal.ai_action.extractAndSaveMemory, {
        sessionId: args.sessionId,
        userId: userId!,
        messageId,
      });
    }

    // Update session timezone from user messages
    if (args.author === "User" && args.timezone) {
      await ctx.db.patch(args.sessionId, { timezone: args.timezone });
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
  toolCalls?: { name: string; args: Record<string, unknown>; result?: unknown }[];
  storageId?: Id<"_storage">;
  fileType?: string;
  fileName?: string;
  attachments?: { storageId: Id<"_storage">; fileName: string; fileType: string }[];
  scope?: { type: "date" | "task" | "event" | "habit"; id: string; title: string };
}) {
  const { sessionId, text, author, timezoneOffset, toolCall, toolCalls, storageId, fileType, fileName, attachments, scope } = args;
  
  const messageId = await ctx.db.insert("messages", {
    sessionId,
    text,
    author,
    timestamp: Date.now(),
    timezoneOffset,
    toolCall,
    toolCalls,
    storageId,
    fileType,
    fileName,
    attachments,
    scope,
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

export const togglePinSession = mutation({
  args: { id: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== userId) throw new Error("Session not found or unauthorized");
    await ctx.db.patch(args.id, { pinned: !session.pinned });
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
