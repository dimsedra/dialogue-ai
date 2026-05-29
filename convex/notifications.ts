import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { auth } from "./auth";

/**
 * Fetch unread notifications for the active user.
 */
export const listUnread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
      .order("desc")
      .collect();
  },
});

/**
 * Mark specified notifications as read.
 */
export const markRead = mutation({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    for (const id of args.ids) {
      const notification = await ctx.db.get(id);
      if (notification && notification.userId === userId) {
        await ctx.db.patch(id, { read: true });
      }
    }
  },
});

/**
 * Mark all notifications as read.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
      .collect();

    for (const item of unread) {
      await ctx.db.patch(item._id, { read: true });
    }
  },
});

/**
 * Internal mutation fired by the Convex Scheduler.
 * Inserts the notification record.
 */
export const sendScheduledNotification = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("event_remind"),
      v.literal("habit_remind"),
      v.literal("system")
    ),
    actionUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: args.title,
      message: args.message,
      type: args.type,
      read: false,
      actionUrl: args.actionUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal mutation executed by background cron scan.
 * Identifies users with unlogged habits for today and fires reminders.
 */
export const triggerDailyHabitReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    
    for (const user of users) {
      const today = new Date();
      const year = today.getUTCFullYear();
      const month = String(today.getUTCMonth() + 1).padStart(2, "0");
      const day = String(today.getUTCDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const habits = await ctx.db
        .query("habits")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("archived"), false))
        .collect();

      const pendingHabits = [];
      for (const habit of habits) {
        const log = await ctx.db
          .query("habitLogs")
          .withIndex("by_habit_dateString", (q) => q.eq("habitId", habit._id).eq("dateString", dateStr))
          .first();
        if (!log) {
          pendingHabits.push(habit.name);
        }
      }

      if (pendingHabits.length > 0) {
        await ctx.db.insert("notifications", {
          userId: user._id,
          title: "Log Your Habits",
          message: `You still have pending habits today: ${pendingHabits.join(", ")}.`,
          type: "habit_remind",
          read: false,
          actionUrl: "/?view=habits",
          createdAt: Date.now(),
        });
      }
    }
  },
});
