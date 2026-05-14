import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      icon: args.icon,
      color: args.color,
      createdAt: Date.now(),
    });
    return workspaceId;
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateContext = mutation({
  args: { id: v.id("workspaces"), context: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { context: args.context });
  },
});

export const deleteWorkspace = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
