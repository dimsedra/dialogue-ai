import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * Helper to cancel any existing scheduled notification and set a new one
 * based on the task's due date and reminder offset.
 */
async function rescheduleTaskReminder(
  ctx: any,
  taskId: Id<"tasks">,
  dueDate: number | undefined,
  text: string,
  userId: Id<"users">,
  reminderOffset: number | undefined | null
) {
  const task = await ctx.db.get(taskId);
  if (!task) return;

  // 1. Cancel existing job if present
  if (task.scheduledNotificationId) {
    try {
      await ctx.scheduler.cancel(task.scheduledNotificationId);
    } catch (e) {
      console.warn("Could not cancel existing task reminder job:", e);
    }
  }

  // 2. Clear scheduled ID if completed, has no due date, or reminderOffset is null/negative/undefined
  if (
    task.completed ||
    dueDate === undefined ||
    reminderOffset === null ||
    reminderOffset === undefined ||
    reminderOffset < 0
  ) {
    await ctx.db.patch(taskId, { scheduledNotificationId: undefined });
    return;
  }

  // 3. Calculate target trigger time
  const reminderTime = dueDate - reminderOffset * 60 * 1000;
  const triggerTime = Math.max(reminderTime, Date.now());

  if (triggerTime > Date.now()) {
    const timePhrase = reminderOffset === 0
      ? "is due now"
      : `is due in ${reminderOffset} minute${reminderOffset === 1 ? "" : "s"}`;

    const scheduledId = await ctx.scheduler.runAt(
      triggerTime,
      internal.notifications.sendScheduledNotification,
      {
        userId,
        title: `Task Reminder: ${text}`,
        message: `"${text}" ${timePhrase}.`,
        type: "task_remind",
        actionUrl: "/?view=tasks",
      }
    );

    // Save job ID reference
    await ctx.db.patch(taskId, { scheduledNotificationId: scheduledId });
  } else {
    // Due date or reminder time is in the past, clear scheduled ID
    await ctx.db.patch(taskId, { scheduledNotificationId: undefined });
  }
}

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

    const updatedTask = await ctx.db.get(args.id);
    if (updatedTask) {
      await rescheduleTaskReminder(
        ctx,
        args.id,
        updatedTask.dueDate,
        updatedTask.text,
        userId,
        updatedTask.reminderOffset
      );
    }
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

    const updatedTask = await ctx.db.get(args.id);
    if (updatedTask) {
      await rescheduleTaskReminder(
        ctx,
        args.id,
        updatedTask.dueDate,
        updatedTask.text,
        userId,
        updatedTask.reminderOffset
      );
    }
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
    
    if (task.scheduledNotificationId) {
      try {
        await ctx.scheduler.cancel(task.scheduledNotificationId);
      } catch (e) {
        console.warn("Could not cancel existing task reminder job on deletion:", e);
      }
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
    dueDateStr: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    progress: v.optional(v.number()),
    statusHook: v.optional(v.string()),
    resources: v.optional(v.array(v.object({
      type: v.union(v.literal("url"), v.literal("document")),
      title: v.string(),
      url: v.string(),
      storageId: v.optional(v.id("_storage")),
      summary: v.optional(v.string()),
      linkedAt: v.number(),
    }))),
    workspaceId: v.optional(v.union(v.id("workspaces"), v.null())),
    overwriteResources: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
    timezoneOffset: v.optional(v.number()),
    reminderOffset: v.optional(v.union(v.number(), v.null())),
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
      if (
        value !== undefined && 
        key !== "id" && 
        key !== "userId" && 
        key !== "notes" && 
        key !== "timezoneOffset" && 
        key !== "resources" && 
        key !== "workspaceId" && 
        key !== "overwriteResources" &&
        key !== "reminderOffset"
      ) {
        updates[key] = value;
      }
    }
    if (args.workspaceId !== undefined) {
      updates.workspaceId = args.workspaceId === null ? undefined : args.workspaceId;
    }
    if (args.reminderOffset !== undefined) {
      updates.reminderOffset = args.reminderOffset === null ? undefined : args.reminderOffset;
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
    if (args.resources !== undefined) {
      if (args.overwriteResources) {
        updates.resources = args.resources;
      } else {
        const existingUrls = new Set((task.resources ?? []).map((r) => r.url));
        const newResources = args.resources.filter((r) => !existingUrls.has(r.url));
        if (newResources.length > 0) {
          updates.resources = [...(task.resources ?? []), ...newResources];
        }
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

    const updatedTask = await ctx.db.get(args.id);
    if (updatedTask) {
      await rescheduleTaskReminder(
        ctx,
        args.id,
        updatedTask.dueDate,
        updatedTask.text,
        userId,
        updatedTask.reminderOffset
      );
    }
  },
});

export const getDailyBriefing = query({
  args: { workspaceId: v.optional(v.id("workspaces")), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return { tasks: [], profile: null };

    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;

    const tasks = args.workspaceId
      ? await ctx.db
          .query("tasks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .filter((q) => 
            q.and(
              q.eq(q.field("userId"), userId),
              q.or(
                q.eq(q.field("completed"), false),
                q.gte(q.field("completedAt"), fortyEightHoursAgo)
              )
            )
          )
          .collect()
      : await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .filter((q) => 
            q.or(
              q.eq(q.field("completed"), false),
              q.gte(q.field("completedAt"), fortyEightHoursAgo)
            )
          )
          .collect();

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return { tasks, profile };
  },
});

export const searchHistory = query({
  args: {
    query: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    let results = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("completed"), true))
      .collect();

    if (args.startTime !== undefined) {
      results = results.filter((t) => (t.completedAt ?? t.createdAt) >= args.startTime!);
    }
    if (args.endTime !== undefined) {
      results = results.filter((t) => (t.completedAt ?? t.createdAt) <= args.endTime!);
    }
    if (args.query) {
      const lower = args.query.toLowerCase();
      results = results.filter((t) => t.text.toLowerCase().includes(lower));
    }
    results.sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
    if (args.limit !== undefined) {
      results = results.slice(0, args.limit);
    }
    return results;
  },
});

export const batchAdd = mutation({
  args: {
    tasks: v.array(v.object({
      text: v.string(),
      priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
      category: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      dueDateStr: v.optional(v.string()),
      notes: v.optional(v.string()),
      reminderOffset: v.optional(v.union(v.number(), v.null())),
    })),
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const ids: string[] = [];
    for (const task of args.tasks) {
      const reminderOffset = task.reminderOffset !== undefined
        ? (task.reminderOffset === null ? undefined : task.reminderOffset)
        : (task.dueDate !== undefined ? 15 : undefined);

      const id = await ctx.db.insert("tasks", {
        userId,
        text: task.text,
        workspaceId: args.workspaceId,
        completed: false,
        dueDate: task.dueDate,
        dueDateStr: task.dueDateStr,
        priority: task.priority || "medium",
        category: task.category || "General",
        notes: task.notes,
        createdAt: Date.now(),
        reminderOffset,
      });
      await rescheduleTaskReminder(ctx, id, task.dueDate, task.text, userId, reminderOffset);
      ids.push(id);
    }
    return ids;
  },
});

export const add = mutation({
  args: {
    text: v.string(),
    workspaceId: v.optional(v.union(v.id("workspaces"), v.null())),
    dueDate: v.optional(v.number()),
    dueDateStr: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    progress: v.optional(v.number()),
    statusHook: v.optional(v.string()),
    resources: v.optional(v.array(v.object({
      type: v.union(v.literal("url"), v.literal("document")),
      title: v.string(),
      url: v.string(),
      storageId: v.optional(v.id("_storage")),
      summary: v.optional(v.string()),
      linkedAt: v.number(),
    }))),
    userId: v.optional(v.id("users")),
    reminderOffset: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const reminderOffset = args.reminderOffset !== undefined
      ? (args.reminderOffset === null ? undefined : args.reminderOffset)
      : (args.dueDate !== undefined ? 15 : undefined);

    const taskId = await ctx.db.insert("tasks", {
      userId,
      text: args.text,
      workspaceId: args.workspaceId === null ? undefined : args.workspaceId,
      completed: false,
      dueDate: args.dueDate,
      dueDateStr: args.dueDateStr,
      priority: args.priority || "medium",
      category: args.category || "General",
      notes: args.notes,
      progress: args.progress,
      statusHook: args.statusHook,
      resources: args.resources,
      contextUpdatedAt: (args.notes || args.progress !== undefined || args.statusHook) ? Date.now() : undefined,
      createdAt: Date.now(),
      reminderOffset,
    });

    await rescheduleTaskReminder(ctx, taskId, args.dueDate, args.text, userId, reminderOffset);

    return taskId;
  },
});
