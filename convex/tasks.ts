import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];
    if (args.workspaceId) {
      const workspace = await ctx.db.get(args.workspaceId);
      if (!workspace || workspace.userId !== userId) return [];

      return await ctx.db
        .query("tasks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const toggleCompleted = mutation({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) throw new Error("Unauthorized");
    
    const completed = !task.completed;
    await ctx.db.patch(args.id, { 
      completed,
      completedAt: completed ? Date.now() : undefined
    });
  },
});

export const completeTask = mutation({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { completed: true });
  },
});

export const deleteTask = mutation({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) throw new Error("Unauthorized");
    
    await ctx.db.delete(args.id);
  },
});

export const updateTask = mutation({
  args: { 
    id: v.id("tasks"),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
    dueDate: v.optional(v.number()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, {
      text: args.text,
      completed: args.completed,
      dueDate: args.dueDate,
      priority: args.priority,
      category: args.category,
      notes: args.notes,
    });
  },
});

export const getDailyBriefing = query({
  args: { workspaceId: v.optional(v.id("workspaces")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return { tasks: [], profile: null };

    const tasks = args.workspaceId
      ? await ctx.db
          .query("tasks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .filter((q) => 
            q.and(
              q.eq(q.field("completed"), false),
              q.eq(q.field("userId"), userId)
            )
          )
          .collect()
      : await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .filter((q) => q.eq(q.field("completed"), false))
          .collect();

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return { tasks, profile };
  },
});
