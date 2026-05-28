import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

export const create = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const workspaceId = await ctx.db.insert("workspaces", {
      userId,
      name: args.name,
      icon: args.icon,
      color: args.color,
      createdAt: Date.now(),
    });
    return workspaceId;
  },
});

export const list = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];
    
    return await ctx.db
      .query("workspaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("workspaces"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const workspace = await ctx.db.get(args.id);
    if (!workspace || workspace.userId !== userId) return null;
    return workspace;
  },
});

export const updateSettings = mutation({
  args: {
    id: v.id("workspaces"),
    context: v.optional(v.string()),
    agentName: v.optional(v.string()),
    color: v.optional(v.string()),
    defaultAgentPersonaId: v.optional(v.union(v.id("agentPersonas"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const workspace = await ctx.db.get(args.id);
    if (!workspace || workspace.userId !== userId) throw new Error("Unauthorized");

    const patch: Record<string, any> = {};
    if (args.context !== undefined) patch.context = args.context;
    if (args.agentName !== undefined) patch.agentName = args.agentName;
    if (args.color !== undefined) patch.color = args.color;
    if (args.defaultAgentPersonaId !== undefined) {
      patch.defaultAgentPersonaId = args.defaultAgentPersonaId === null ? undefined : args.defaultAgentPersonaId;
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const updateContext = mutation({
  args: { id: v.id("workspaces"), context: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const workspace = await ctx.db.get(args.id);
    if (!workspace || workspace.userId !== userId) throw new Error("Unauthorized");
    
    await ctx.db.patch(args.id, { context: args.context });
  },
});

export const deleteWorkspace = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    const workspace = await ctx.db.get(args.id);
    if (!workspace || workspace.userId !== userId) throw new Error("Unauthorized");
    
    await ctx.db.delete(args.id);
  },
});
