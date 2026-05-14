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
