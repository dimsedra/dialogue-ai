import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    if (args.workspaceId) {
      return await ctx.db
        .query("events")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();
    }
    return await ctx.db.query("events").collect();
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
