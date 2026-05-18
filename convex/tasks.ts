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

export const get = query({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) return null;
    return task;
  },
});

export const toggleCompleted = mutation({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) {
      console.error("Unauthorized task toggle attempt:", { taskId: args.id, taskOwner: task?.userId, requestingUser: userId, taskFound: !!task });
      throw new Error("Unauthorized");
    }
    
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
    if (!task || task.userId !== userId) {
      console.error("Unauthorized task completion attempt:", { taskId: args.id, taskOwner: task?.userId, requestingUser: userId, taskFound: !!task });
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { completed: true, completedAt: Date.now() });
  },
});

export const deleteTask = mutation({
  args: { id: v.id("tasks"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) {
      console.error("Unauthorized task deletion attempt:", { taskId: args.id, taskOwner: task?.userId, requestingUser: userId, taskFound: !!task });
      throw new Error("Unauthorized");
    }
    
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
    progress: v.optional(v.number()),
    statusHook: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) {
      console.error("Unauthorized task update attempt:", {
        taskId: args.id,
        taskOwner: task?.userId,
        requestingUser: userId,
        taskFound: !!task
      });
      throw new Error("Unauthorized");
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && key !== "id" && key !== "userId" && key !== "notes" && key !== "timezoneOffset") {
        updates[key] = value;
      }
    }
    if (args.notes !== undefined) {
      let incomingNote = args.notes.trim();
      const existingNotes = task.notes ? task.notes.trim() : "";
      if (existingNotes && incomingNote.startsWith(existingNotes)) {
        incomingNote = incomingNote.slice(existingNotes.length).trim();
      }
      incomingNote = incomingNote.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]\s*/, "").trim();
      if (incomingNote) {
        let now = new Date();
        if (args.timezoneOffset !== undefined) {
          now = new Date(Date.now() - (args.timezoneOffset * 60000));
        }
        const pad = (n: number) => n.toString().padStart(2, "0");
        const timestamp = `[${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}]`;
        const newEntry = `${timestamp} ${incomingNote}`;
        updates.notes = existingNotes ? `${existingNotes}\n${newEntry}` : newEntry;
      }
    }
    if (args.notes !== undefined || args.progress !== undefined || args.statusHook !== undefined) {
      updates.contextUpdatedAt = Date.now();
    }
    if (args.completed === true && !task.completed) {
      updates.completedAt = Date.now();
    } else if (args.completed === false && task.completed) {
      updates.completedAt = undefined;
    }
    await ctx.db.patch(args.id, updates);
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
