import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listIncomplete = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    if (args.workspaceId) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("completed"), false))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("completed"), false))
      .order("desc")
      .collect();
  },
});

export const toggleCompleted = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    const completed = !task.completed;
    await ctx.db.patch(args.id, { 
      completed,
      completedAt: completed ? Date.now() : undefined
    });
  },
});

export const deleteTask = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateTask = mutation({
  args: { 
    id: v.id("tasks"),
    text: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const getDailyBriefing = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    if (args.workspaceId) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("completed"), false))
        .collect();
      const profile = await ctx.db.query("userProfile").first();
      return { tasks, profile };
    }

    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
    const profile = await ctx.db.query("userProfile").first();
    return { tasks, profile };
  },
});
