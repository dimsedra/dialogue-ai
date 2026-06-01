import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getLocalDayOfWeek, getOffsetMinutes, getLocalDateString } from "./timezones";

/**
 * Monday weekly cron: shared data collection → OCEAN + Reflections prompts.
 * Runs every hour, schedules users at their local Monday.
 * Uses idempotency check to prevent 24x spam.
 */
export const cronTriggerWeekly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    for (const user of users) {
      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();

      // Get IANA timezone from session
      const timezone = lastSession?.timezone || "UTC";

      // Check if it's Monday in the user's local time
      const localDay = getLocalDayOfWeek(timezone);
      if (localDay !== 1) continue; // Not Monday

      // Calculate this Monday's start time (epoch ms)
      // Use the local date to find Monday's timestamp
      const localDateStr = getLocalDateString(timezone);
      const [year, month, day] = localDateStr.split("-").map(Number);
      const offset = getOffsetMinutes(timezone);

      // Find the most recent Monday
      const today = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = today.getUTCDay(); // 0=Sun, 1=Mon
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
      const mondayStart = monday.getTime() - offset * 60000; // Convert to UTC

      // Idempotency check: does a weekly digest already exist for this Monday?
      const existing = await ctx.db
        .query("weeklyDigests")
        .withIndex("by_user_week", (q) => q.eq("userId", user._id).eq("weekStart", mondayStart))
        .first();

      if (existing) continue; // Already generated this week

      // 1. OCEAN prompt (agent-facing)
      await ctx.scheduler.runAfter(0, internal.ai_action.generateWeeklyOCEAN, {
        userId: user._id,
        timezone,
        timezoneOffset: offset,
      });

      // 2. Reflections prompt (user-facing) — reuses existing generateCronReflection
      await ctx.scheduler.runAfter(0, internal.ai_action.generateCronReflection, {
        userId: user._id,
        type: "weekly",
        timezone,
      });
    }

    // 3. Cleanup: delete session summaries older than 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldSummaries = await ctx.db
      .query("sessionSummaries")
      .filter((q) => q.lt(q.field("createdAt"), sevenDaysAgo))
      .collect();
    for (const summary of oldSummaries) {
      await ctx.db.delete(summary._id);
    }
  },
});

/**
 * Monthly cron: refine profile + archive weeklies.
 * Runs at 00:05 UTC on the 1st of every month.
 */
export const cronTriggerMonthly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    const now = new Date();
    const isDecember = now.getUTCMonth() === 11;

    for (const user of users) {
      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();
      const timezone = lastSession?.timezone || "UTC";

      await ctx.scheduler.runAfter(0, internal.ai_action.generateMonthlyOCEAN, {
        userId: user._id,
        timezone,
      });

      // Yearly Reflections: fire in December (year-to-date review)
      if (isDecember) {
        await ctx.scheduler.runAfter(0, internal.ai_action.generateCronReflection, {
          userId: user._id,
          type: "yearly",
          timezone,
        });
      }
    }
  },
});
