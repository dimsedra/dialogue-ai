import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getLocalDateString, getOffsetMinutes, getLocalHour } from "./timezones";

// Internal queries for database operations
export const getUserSessions = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getMessagesBySession = internalQuery({
  args: {
    sessionId: v.id("chatSessions"),
    startOfDay: v.number(),
    endOfDay: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) =>
        q.and(
          q.eq(q.field("author"), "User"),
          q.gte(q.field("timestamp"), args.startOfDay),
          q.lt(q.field("timestamp"), args.endOfDay)
        )
      )
      .collect();
  },
});

export const getSessionSummaryByDate = internalQuery({
  args: {
    userId: v.id("users"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionSummaries")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .first();
  },
});

export const insertSessionSummary = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessionSummaries", {
      userId: args.userId,
      date: args.date,
      summary: args.summary,
      createdAt: Date.now(),
    });
  },
});

// Cron trigger — runs every hour, schedules users at their local 23:59
export const cronTriggerDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.USE_PB === "true") return;
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();

      // Get IANA timezone from session, fallback to UTC
      let timezone = lastSession?.timezone || "UTC";

      const now = new Date();
      const todayStr = getLocalDateString(timezone, now);

      // Calculate yesterday's date in user's timezone
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = getLocalDateString(timezone, yesterday);

      // Check if today's summary already exists (idempotent)
      const todaySummary = await ctx.db
        .query("sessionSummaries")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", todayStr))
        .first();

      // Check if yesterday's summary exists (DST catch-up)
      const yesterdaySummary = await ctx.db
        .query("sessionSummaries")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", yesterdayStr))
        .first();

      // Determine what to generate
      let targetDate: string | null = null;

      if (!yesterdaySummary) {
        // Yesterday's summary is missing — catch-up (handles DST skip or missed run)
        targetDate = yesterdayStr;
      } else if (!todaySummary) {
        // Today's summary is missing — check if it's past 23:00 local
        const localHour = getLocalHour(timezone, now);
        if (localHour >= 23) {
          targetDate = todayStr;
        }
      }

      // Skip if nothing to generate
      if (!targetDate) continue;

      const offset = getOffsetMinutes(timezone, now);
      await ctx.scheduler.runAfter(0, internal.background_jobs.generateDailySummary, {
        userId: user._id,
        timezone,
        timezoneOffset: offset,
      });
    }
  },
});
