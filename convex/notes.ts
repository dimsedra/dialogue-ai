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

export const seedStressTestData = mutation({
  args: {
    userId: v.optional(v.id("users")),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) {
      const firstUser = await ctx.db.query("users").first();
      if (!firstUser) throw new Error("No user found in the database. Please sign up or create a user first.");
      userId = firstUser._id;
    }
    const offset = args.timezoneOffset ?? 0;

    // 1. Idempotency cleanup: Remove previously seeded stress-test tasks, events, habits, and logs
    const existingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId!))
      .collect();
    for (const t of existingTasks) {
      if (t.text === "Deploy Auth Service" || t.text === "Write Documentation") {
        await ctx.db.delete(t._id);
      }
    }

    const existingEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId!))
      .collect();
    for (const e of existingEvents) {
      if (e.title === "Sprint Planning" || e.title === "Client Demo") {
        await ctx.db.delete(e._id);
      }
    }

    const existingHabits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId!))
      .collect();
    for (const h of existingHabits) {
      if (h.name === "Daily Gym") {
        const logs = await ctx.db
          .query("habitLogs")
          .withIndex("by_habit", (q) => q.eq("habitId", h._id))
          .collect();
        for (const l of logs) {
          await ctx.db.delete(l._id);
        }
        await ctx.db.delete(h._id);
      }
    }

    // 2. Fetch or create workspaces (Dev Workspace and Personal)
    const existingWorkspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_user", (q) => q.eq("userId", userId!))
      .collect();

    let devWorkspace = existingWorkspaces.find((w) => w.name === "Dev Workspace");
    if (!devWorkspace) {
      const wId = await ctx.db.insert("workspaces", {
        userId: userId!,
        name: "Dev Workspace",
        icon: "💻",
        color: "blue",
        createdAt: Date.now(),
      });
      devWorkspace = (await ctx.db.get(wId))!;
    }

    let personalWorkspace = existingWorkspaces.find((w) => w.name === "Personal");
    if (!personalWorkspace) {
      const wId = await ctx.db.insert("workspaces", {
        userId: userId!,
        name: "Personal",
        icon: "🏠",
        color: "green",
        createdAt: Date.now(),
      });
      personalWorkspace = (await ctx.db.get(wId))!;
    }

    // 3. Compute relative timestamps
    // Day 8 is "now"
    const now = Date.now();
    const day1 = now - 7 * 24 * 60 * 60 * 1000;
    const day2 = now - 6 * 24 * 60 * 60 * 1000;
    const day3 = now - 5 * 24 * 60 * 60 * 1000;
    const day4 = now - 4 * 24 * 60 * 60 * 1000;
    const day5 = now - 3 * 24 * 60 * 60 * 1000;
    const day6 = now - 2 * 24 * 60 * 60 * 1000;
    const day7 = now - 1 * 24 * 60 * 60 * 1000;

    // Helper to format Date to YYYY-MM-DD in the target timezone
    const formatDateString = (timestamp: number, tzOffset: number): string => {
      const d = new Date(timestamp - tzOffset * 60000);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // 4. Seed Daily Gym Habit and logs
    const gymHabitId = await ctx.db.insert("habits", {
      userId: userId!,
      name: "Daily Gym",
      frequency: "daily",
      frequencyConfig: {},
      currentStreak: 3,
      longestStreak: 3,
      archived: false,
      createdAt: day1,
      workspaceId: personalWorkspace._id,
    });

    const logsToInsert = [
      { timestamp: day1, status: "completed" as const, notes: "First day of the week, felt highly motivated." },
      { timestamp: day2, status: "skipped" as const, notes: "Muscle soreness, forced rest day." },
      { timestamp: day3, status: "completed" as const, notes: "Morning cardio, good stamina." },
      // Day 4: left unlogged
      { timestamp: day5, status: "completed" as const, notes: "Felt strong during heavy squats." },
      { timestamp: day6, status: "completed" as const, notes: "Late night workout, low energy but completed." },
      { timestamp: day7, status: "completed" as const, notes: "Bench press PR set! Felt excellent." },
    ];

    for (const log of logsToInsert) {
      await ctx.db.insert("habitLogs", {
        userId: userId!,
        habitId: gymHabitId,
        timestamp: log.timestamp,
        dateString: formatDateString(log.timestamp, offset),
        status: log.status,
        notes: log.notes,
      });
    }

    // 5. Seed Tasks
    await ctx.db.insert("tasks", {
      userId: userId!,
      text: "Deploy Auth Service",
      workspaceId: devWorkspace._id,
      completed: false,
      progress: 90,
      statusHook: "Blocked by auth session leakage",
      dueDate: now + 1 * 24 * 60 * 60 * 1000, // Due tomorrow
      createdAt: day1,
      notes: `[${formatDateString(day2, offset)} 09:00] OAuth session handling complexity exploded.\n[${formatDateString(day4, offset)} 14:00] Failing test cases in dev integration suite, blocker.\n[${formatDateString(day5, offset)} 10:00] Extended due date to allow session leakage fix.`,
    });

    await ctx.db.insert("tasks", {
      userId: userId!,
      text: "Write Documentation",
      workspaceId: devWorkspace._id,
      completed: true,
      completedAt: day4 + 7 * 60 * 60 * 1000, // completed on Day 4 afternoon
      progress: 100,
      statusHook: "Documentation completed",
      createdAt: day2,
      notes: `[${formatDateString(day4, offset)} 16:00] All wiki documents written, reviewed, and published.`,
    });

    // 6. Seed Events
    await ctx.db.insert("events", {
      userId: userId!,
      title: "Sprint Planning",
      startTime: day1 + 1 * 60 * 60 * 1000,
      endTime: day1 + 2.5 * 60 * 60 * 1000,
      eventType: "interval",
      notes: `[${formatDateString(day1, offset)} 10:00] Initial event setup. Outcome: Decided to drop support for legacy cookie auth.`,
      outcome: "Decided to drop support for legacy cookie auth.",
      statusHook: "Sprint planned",
      workspaceId: devWorkspace._id,
      createdAt: day1,
    });

    await ctx.db.insert("events", {
      userId: userId!,
      title: "Client Demo",
      startTime: day4 + 6 * 60 * 60 * 1000,
      endTime: day4 + 7 * 60 * 60 * 1000,
      eventType: "interval",
      cancelled: true,
      notes: `[${formatDateString(day3, offset)} 11:00] Client postponed meeting due to internal calendar conflicts.`,
      statusHook: "Meeting postponed",
      workspaceId: devWorkspace._id,
      createdAt: day1,
    });

    return {
      userId,
      devWorkspaceId: devWorkspace._id,
      personalWorkspaceId: personalWorkspace._id,
    };
  },
});
