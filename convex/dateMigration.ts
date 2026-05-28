import { internalMutation } from "./_generated/server";
import { epochMsToDateStr } from "./timezones";

/**
 * One-time migration: backfill *Str fields from existing epoch ms fields.
 * Run from CLI: npx convex run dateMigration:runAll
 */
export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    if (users.length === 0) return { error: "No users found" };

    const results: Record<string, number> = { tasks: 0, events: 0, reflections: 0, weeklyDigests: 0, archivedSummaries: 0 };

    for (const user of users) {
      const userId = user._id;

      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      const timezone = lastSession?.timezone || "UTC";

      // 1. Tasks: backfill dueDateStr
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const task of tasks) {
        if (task.dueDate !== undefined && task.dueDateStr === undefined) {
          await ctx.db.patch(task._id, {
            dueDateStr: epochMsToDateStr(task.dueDate, timezone),
          });
          results.tasks++;
        }
      }

      // 2. Events: backfill recurrence.untilStr and recurrence.exceptionsStr
      const events = await ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const event of events) {
        if (event.recurrence) {
          let needsPatch = false;
          const updatedRecurrence = { ...event.recurrence };

          if (event.recurrence.until !== undefined && event.recurrence.untilStr === undefined) {
            updatedRecurrence.untilStr = epochMsToDateStr(event.recurrence.until, timezone);
            needsPatch = true;
          }

          if (event.recurrence.exceptions !== undefined && event.recurrence.exceptionsStr === undefined) {
            updatedRecurrence.exceptionsStr = event.recurrence.exceptions.map((e) => epochMsToDateStr(e, timezone));
            needsPatch = true;
          }

          if (needsPatch) {
            await ctx.db.patch(event._id, { recurrence: updatedRecurrence });
            results.events++;
          }
        }
      }

      // 3. Reflections: backfill periodStartStr and periodEndStr
      const reflections = await ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) => q.eq("userId", userId))
        .collect();
      for (const reflection of reflections) {
        const patch: Record<string, unknown> = {};
        let needsPatch = false;

        if (reflection.periodStartStr === undefined) {
          patch["periodStartStr"] = epochMsToDateStr(reflection.periodStart, timezone);
          needsPatch = true;
        }
        if (reflection.periodEndStr === undefined) {
          patch["periodEndStr"] = epochMsToDateStr(reflection.periodEnd, timezone);
          needsPatch = true;
        }

        if (needsPatch) {
          await ctx.db.patch(reflection._id, patch);
          results.reflections++;
        }
      }

      // 4. WeeklyDigests: backfill weekStartStr
      const digests = await ctx.db
        .query("weeklyDigests")
        .withIndex("by_user_week", (q) => q.eq("userId", userId))
        .collect();
      for (const digest of digests) {
        if (digest.weekStartStr === undefined) {
          await ctx.db.patch(digest._id, {
            weekStartStr: epochMsToDateStr(digest.weekStart, timezone),
          });
          results.weeklyDigests++;
        }
      }

      // 5. ArchivedSummaries: backfill originalDateStr
      const archived = await ctx.db
        .query("archivedSummaries")
        .withIndex("by_user_type_date", (q) => q.eq("userId", userId))
        .collect();
      for (const entry of archived) {
        if (entry.originalDateStr === undefined) {
          await ctx.db.patch(entry._id, {
            originalDateStr: epochMsToDateStr(entry.originalDate, timezone),
          });
          results.archivedSummaries++;
        }
      }
    }

    return results;
  },
});
