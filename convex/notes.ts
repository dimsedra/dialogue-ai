import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// Helper function to expand recurring events into a window
function expandRecurringEvents(
  events: Doc<"events">[],
  windowStart: number,
  windowEnd: number
): Doc<"events">[] {
  const expanded: Doc<"events">[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      expanded.push(event);
      continue;
    }

    const duration = event.endTime !== undefined ? event.endTime - event.startTime : 0;
    const limit = Math.min(windowEnd, event.recurrence.until ?? windowEnd);
    const exceptions = event.recurrence.exceptions ?? [];

    if (event.recurrence.frequency === "daily") {
      const d = new Date(event.startTime);
      while (d.getTime() <= limit) {
        const timestamp = d.getTime();
        if (timestamp >= windowStart) {
          const isCancelled = exceptions.includes(timestamp);
          if (!isCancelled) {
            expanded.push({
              ...event,
              startTime: timestamp,
              endTime: event.endTime !== undefined ? timestamp + duration : undefined,
            });
          }
        }
        d.setDate(d.getDate() + event.recurrence.interval);
      }
    } else if (event.recurrence.frequency === "weekly") {
      const d = new Date(event.startTime);
      const daysOfWeek = event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
        ? event.recurrence.daysOfWeek
        : [d.getDay()];

      const currWeekStart = new Date(event.startTime);
      currWeekStart.setDate(currWeekStart.getDate() - currWeekStart.getDay());
      let weeksCounter = 0;

      while (currWeekStart.getTime() <= limit) {
        if (weeksCounter % event.recurrence.interval === 0) {
          for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
            if (daysOfWeek.includes(dayIndex)) {
              const targetDate = new Date(currWeekStart);
              targetDate.setDate(targetDate.getDate() + dayIndex);
              const origTime = new Date(event.startTime);
              targetDate.setHours(origTime.getHours(), origTime.getMinutes(), origTime.getSeconds(), origTime.getMilliseconds());
              
              const timestamp = targetDate.getTime();
              if (timestamp >= event.startTime && timestamp <= limit && timestamp >= windowStart) {
                const isCancelled = exceptions.includes(timestamp);
                if (!isCancelled) {
                  expanded.push({
                    ...event,
                    startTime: timestamp,
                    endTime: event.endTime !== undefined ? timestamp + duration : undefined,
                  });
                }
              }
            }
          }
        }
        currWeekStart.setDate(currWeekStart.getDate() + 7);
        weeksCounter++;
      }
    }
  }
  return expanded;
}

export const recentActivityFeedHandler = async (
  ctx: QueryCtx,
  args: {
    userId?: Id<"users">;
    startTime?: number;
    endTime?: number;
  }
) => {
  const userId = args.userId ?? (await auth.getUserId(ctx));
  if (!userId) return [];

    const end = args.endTime ?? Date.now();
    const start = args.startTime ?? (end - 7 * 24 * 60 * 60 * 1000);

    // Fetch workspaces for mapping workspace names
    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const workspaceMap = new Map(workspaces.map((w) => [w._id, w.name]));

    // 1. Fetch tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const taskEntries = tasks
      .filter((t) => {
        const hasNotes = t.notes && t.notes.trim().length > 0;
        if (!hasNotes) return false;

        const isRecent =
          t.createdAt >= start && t.createdAt <= end ||
          (t.completedAt !== undefined && t.completedAt >= start && t.completedAt <= end) ||
          (t.contextUpdatedAt !== undefined && t.contextUpdatedAt >= start && t.contextUpdatedAt <= end);

        return isRecent;
      })
      .map((t) => {
        const workspaceName = t.workspaceId ? (workspaceMap.get(t.workspaceId) ?? "") : "";
        const refTime = Math.max(
          t.createdAt,
          t.completedAt ?? 0,
          t.contextUpdatedAt ?? 0
        );
        return {
          entityType: "task" as const,
          entityName: t.text,
          workspaceName,
          date: new Date(refTime).toISOString(),
          noteText: t.notes ?? "",
          timestamp: refTime,
        };
      });

    // 2. Fetch events (and expand recurring ones)
    const rawEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const expandedEvents = expandRecurringEvents(rawEvents, start, end);
    const eventEntries = expandedEvents
      .filter((e) => {
        const hasNotes = e.notes && e.notes.trim().length > 0;
        if (!hasNotes) return false;
        const isRecent = e.startTime >= start && e.startTime <= end;
        return isRecent;
      })
      .map((e) => {
        const workspaceName = e.workspaceId ? (workspaceMap.get(e.workspaceId) ?? "") : "";
        return {
          entityType: "event" as const,
          entityName: e.title,
          workspaceName,
          date: new Date(e.startTime).toISOString(),
          noteText: e.notes ?? "",
          timestamp: e.startTime,
        };
      });

    // Add parent event edits if the event notes were updated in the window but event startTime is outside
    const editedParentEventEntries = rawEvents
      .filter((e) => {
        const hasNotes = e.notes && e.notes.trim().length > 0;
        if (!hasNotes) return false;

        const isEditedInWindow = e.contextUpdatedAt !== undefined && e.contextUpdatedAt >= start && e.contextUpdatedAt <= end;
        if (!isEditedInWindow) return false;

        // If this event has recurrence, its occurrences might have been added. To avoid double-counting if an occurrence is in the window,
        // we can check if it already got captured.
        return true;
      })
      .map((e) => {
        const workspaceName = e.workspaceId ? (workspaceMap.get(e.workspaceId) ?? "") : "";
        const refTime = e.contextUpdatedAt!;
        return {
          entityType: "event" as const,
          entityName: e.title,
          workspaceName,
          date: new Date(refTime).toISOString(),
          noteText: e.notes ?? "",
          timestamp: refTime,
        };
      });

    // Deduplicate event entries by noteText/timestamp to avoid duplicates from occurrences vs parent edits
    const uniqueEvents = new Map<string, typeof eventEntries[0]>();
    for (const e of [...eventEntries, ...editedParentEventEntries]) {
      const key = `${e.entityName}-${e.timestamp}-${e.noteText}`;
      uniqueEvents.set(key, e);
    }

    // 3. Fetch habit logs
    const logs = await ctx.db
      .query("habitLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const habitMap = new Map(habits.map((h) => [h._id, h]));

    const habitEntries = logs
      .filter((log) => {
        const hasNotes = log.notes && log.notes.trim().length > 0;
        if (!hasNotes) return false;

        const isRecent = log.timestamp >= start && log.timestamp <= end;
        return isRecent;
      })
      .map((log) => {
        const habit = habitMap.get(log.habitId);
        const habitName = habit ? habit.name : "Habit Log";
        const workspaceName = habit && habit.workspaceId ? (workspaceMap.get(habit.workspaceId) ?? "") : "";
        return {
          entityType: "habit" as const,
          entityName: habitName,
          workspaceName,
          date: new Date(log.timestamp).toISOString(),
          noteText: log.notes ?? "",
          timestamp: log.timestamp,
        };
      });

    // Combine and sort chronologically (oldest to newest)
    const feed = [...taskEntries, ...Array.from(uniqueEvents.values()), ...habitEntries];
    feed.sort((a, b) => a.timestamp - b.timestamp);

    return feed.map(({ entityType, entityName, workspaceName, date, noteText }) => ({
      entityType,
      entityName,
      workspaceName,
      date,
      noteText,
    }));
};

export const recentActivityFeed = query({
  args: {
    userId: v.optional(v.id("users")),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: recentActivityFeedHandler,
});

export const saveWeeklySummary = mutation({
  args: {
    summary: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      const weekly = profile.weeklyNotesSummaries ?? [];
      await ctx.db.patch(profile._id, {
        weeklyNotesSummaries: [...weekly, args.summary],
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId,
        bio: "",
        preferences: {},
        weeklyNotesSummaries: [args.summary],
      });
    }
  },
});

export const saveMonthlySummary = mutation({
  args: {
    summary: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      const monthly = profile.monthlyNotesSummaries ?? [];
      await ctx.db.patch(profile._id, {
        monthlyNotesSummaries: [...monthly, args.summary],
        weeklyNotesSummaries: [], // clear weekly summaries
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId,
        bio: "",
        preferences: {},
        monthlyNotesSummaries: [args.summary],
        weeklyNotesSummaries: [],
      });
    }
  },
});

export const saveBehavioralProfile = mutation({
  args: {
    profile: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const userProfileDoc = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (userProfileDoc) {
      await ctx.db.patch(userProfileDoc._id, {
        behavioralProfile: args.profile,
        monthlyNotesSummaries: [], // clear monthly summaries
      });
    } else {
      await ctx.db.insert("userProfile", {
        userId,
        bio: "",
        preferences: {},
        behavioralProfile: args.profile,
        monthlyNotesSummaries: [],
      });
    }
  },
});

export const cronTriggerPyramid = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const lastSession = await ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();

      let timezoneOffset = 0;
      if (lastSession) {
        const lastMsgWithTz = await ctx.db
          .query("messages")
          .withIndex("by_session", (q) => q.eq("sessionId", lastSession._id))
          .order("desc")
          .filter((q) => q.neq(q.field("timezoneOffset"), undefined))
          .first();
        if (lastMsgWithTz && lastMsgWithTz.timezoneOffset !== undefined) {
          timezoneOffset = lastMsgWithTz.timezoneOffset;
        }
      }

      await ctx.scheduler.runAfter(0, api.notes_action.compileNotesPyramidSegment, {
        userId: user._id,
        timezoneOffset,
      });
    }
  },
});
