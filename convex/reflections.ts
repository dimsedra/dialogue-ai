import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getLocalDayOfWeek, getOffsetMinutes, getLocalDateString } from "./timezones";

type ReflectionEventSummary = Pick<
  Doc<"events">,
  "title" | "startTime" | "outcome" | "cancelled"
>;

// Helper to expand recurring events for a specific window
function expandRecurringEventsForWindow(
  events: Doc<"events">[],
  windowStart: number,
  windowEnd: number,
) {
  const expanded: (Doc<"events"> & { cancelled?: boolean })[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      if (event.startTime >= windowStart && event.startTime <= windowEnd) {
        expanded.push(event);
      }
      continue;
    }

    const duration =
      event.endTime !== undefined ? event.endTime - event.startTime : 0;
    const limit = Math.min(windowEnd, event.recurrence.until ?? windowEnd);
    const exceptions = event.recurrence.exceptions ?? [];

    if (event.recurrence.frequency === "daily") {
      const d = new Date(event.startTime);
      while (d.getTime() <= limit) {
        const timestamp = d.getTime();
        if (timestamp >= windowStart) {
          expanded.push({
            ...event,
            startTime: timestamp,
            endTime:
              event.endTime !== undefined ? timestamp + duration : undefined,
            cancelled: exceptions.includes(timestamp),
          });
        }
        d.setDate(d.getDate() + event.recurrence.interval);
      }
    } else if (event.recurrence.frequency === "weekly") {
      const d = new Date(event.startTime);
      const daysOfWeek =
        event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
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
              targetDate.setHours(
                origTime.getHours(),
                origTime.getMinutes(),
                origTime.getSeconds(),
                origTime.getMilliseconds(),
              );

              const timestamp = targetDate.getTime();
              if (
                timestamp >= event.startTime &&
                timestamp <= limit &&
                timestamp >= windowStart
              ) {
                expanded.push({
                  ...event,
                  startTime: timestamp,
                  endTime:
                    event.endTime !== undefined
                      ? timestamp + duration
                      : undefined,
                  cancelled: exceptions.includes(timestamp),
                });
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

export const listReflections = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    type: v.optional(
      v.union(v.literal("weekly"), v.literal("monthly"), v.literal("yearly")),
    ),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    let reflectionsQuery = ctx.db
      .query("reflections")
      .withIndex("by_user_type", (q) => q.eq("userId", userId));

    if (args.type) {
      const typeFilter = args.type;
      reflectionsQuery = ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("type", typeFilter),
        );
    }

    const results = await reflectionsQuery.collect();

    // Filter by workspace if provided
    if (args.workspaceId) {
      return results.filter((r) => r.workspaceId === args.workspaceId);
    }
    return results;
  },
});

export const getReflection = query({
  args: { id: v.id("reflections"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const reflection = await ctx.db.get(args.id);
    if (!reflection || reflection.userId !== userId) return null;
    return reflection;
  },
});

export const getReflectionForPeriod = query({
  args: {
    type: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
    periodStart: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;

    return await ctx.db
      .query("reflections")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", userId).eq("periodStart", args.periodStart),
      )
      .filter((q) => q.eq(q.field("type"), args.type))
      .first();
  },
});

export const saveReflection = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    type: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
    periodStart: v.number(),
    periodStartStr: v.optional(v.string()),
    periodEnd: v.number(),
    periodEndStr: v.optional(v.string()),
    periodLabel: v.string(),
    summary: v.string(),
    stats: v.object({
      tasksCompleted: v.number(),
      tasksCreated: v.number(),
      eventsAttended: v.number(),
      topCategories: v.optional(v.array(v.string())),
      streakDays: v.optional(v.number()),
      habitLogsCompleted: v.optional(v.number()),
      habitLogsSkipped: v.optional(v.number()),
      habitStreakDays: v.optional(v.number()),
    }),
    userReflection: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    // Check for existing reflection for this period & type to avoid duplication
    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_user_period", (q) =>
        q.eq("userId", userId).eq("periodStart", args.periodStart),
      )
      .filter((q) => q.eq(q.field("type"), args.type))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        stats: args.stats,
        userReflection: args.userReflection ?? existing.userReflection,
      });
      return existing._id;
    }

    return await ctx.db.insert("reflections", {
      userId,
      workspaceId: args.workspaceId,
      type: args.type,
      periodStart: args.periodStart,
      periodStartStr: args.periodStartStr,
      periodEnd: args.periodEnd,
      periodEndStr: args.periodEndStr,
      periodLabel: args.periodLabel,
      summary: args.summary,
      stats: args.stats,
      userReflection: args.userReflection,
      createdAt: Date.now(),
    });
  },
});

export const saveUserComment = mutation({
  args: {
    id: v.id("reflections"),
    userReflection: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    const reflection = await ctx.db.get(args.id);
    if (!reflection || reflection.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      userReflection: args.userReflection,
    });
    return reflection._id;
  },
});

export const toggleShareReflection = mutation({
  args: {
    id: v.id("reflections"),
    shared: v.boolean(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");
    const reflection = await ctx.db.get(args.id);
    if (!reflection || reflection.userId !== userId) {
      throw new Error("Reflection not found");
    }
    await ctx.db.patch(args.id, { shared: args.shared });
    return { shared: args.shared };
  },
});

export const getPublicReflection = query({
  args: { id: v.id("reflections") },
  handler: async (ctx, args) => {
    const reflection = await ctx.db.get(args.id);
    if (!reflection || reflection.shared !== true) return null;
    return reflection;
  },
});

// Compile stats internally
export const compileReflectionStats = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    type: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
    periodStart: v.number(),
    periodEnd: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;

    // --- PYRAMID SYNTHESIS ---
    // If Monthly or Yearly, read existing sub-reflections to aggregate stats & summaries
    if (args.type === "monthly" || args.type === "yearly") {
      const subType = args.type === "monthly" ? "weekly" : "monthly";
      const subReflections = await ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("type", subType),
        )
        .collect();

      const periodReflections = subReflections.filter(
        (r) =>
          r.periodStart >= args.periodStart && r.periodEnd <= args.periodEnd,
      );

      // If we don't have sub-reflections, fallback to raw calculation, otherwise aggregate
      if (periodReflections.length > 0) {
        let tasksCompleted = 0;
        let tasksCreated = 0;
        let eventsAttended = 0;
        let habitLogsCompleted = 0;
        let habitLogsSkipped = 0;
        let habitStreakDays = 0;
        const categoryCounts: Record<string, number> = {};
        const summaries: string[] = [];
        let maxStreak = 0;

        for (const ref of periodReflections) {
          tasksCompleted += ref.stats.tasksCompleted;
          tasksCreated += ref.stats.tasksCreated;
          eventsAttended += ref.stats.eventsAttended;
          habitLogsCompleted += ref.stats.habitLogsCompleted ?? 0;
          habitLogsSkipped += ref.stats.habitLogsSkipped ?? 0;
          habitStreakDays = Math.max(
            habitStreakDays,
            ref.stats.habitStreakDays ?? 0,
          );
          maxStreak = Math.max(maxStreak, ref.stats.streakDays ?? 0);

          if (ref.stats.topCategories) {
            for (const cat of ref.stats.topCategories) {
              categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
          }
          summaries.push(
            `[${ref.periodLabel}]:\nStats: Tasks completed: ${ref.stats.tasksCompleted}, events: ${ref.stats.eventsAttended}, habits completed: ${ref.stats.habitLogsCompleted ?? 0}.\nSummary: ${ref.summary}\nUser Feedback: ${ref.userReflection || "None"}`,
          );
        }

        const topCategories = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map((entry) => entry[0]);

        return {
          tasksCompleted,
          tasksCreated,
          eventsAttended,
          habitLogsCompleted,
          habitLogsSkipped,
          habitStreakDays,
          topCategories,
          streakDays: maxStreak,
          subSummaries: summaries.join("\n\n"),
        };
      }
    }

    // --- WEEKLY OR FALLBACK RAW CALCULATION ---
    // 1. Query all tasks created or completed in this period
    const rawTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const filteredTasks = args.workspaceId
      ? rawTasks.filter((t) => t.workspaceId === args.workspaceId)
      : rawTasks;

    const tasksCreatedList = filteredTasks.filter(
      (t) => t.createdAt >= args.periodStart && t.createdAt <= args.periodEnd,
    );
    const tasksCompletedList = filteredTasks.filter(
      (t) =>
        t.completed &&
        t.completedAt !== undefined &&
        t.completedAt >= args.periodStart &&
        t.completedAt <= args.periodEnd,
    );

    // 2. Query events in this period
    const rawEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const filteredEvents = args.workspaceId
      ? rawEvents.filter((e) => e.workspaceId === args.workspaceId)
      : rawEvents;

    const eventsList = expandRecurringEventsForWindow(
      filteredEvents,
      args.periodStart,
      args.periodEnd,
    );

    // 3. Category count
    const categoryCounts: Record<string, number> = {};
    for (const t of tasksCompletedList) {
      if (t.category) {
        categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      }
    }
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((entry) => entry[0]);

    // 4. Calculate streak (consecutive days with completed tasks in the last 30 days up to periodEnd)
    const thirtyDaysAgo = args.periodEnd - 30 * 24 * 3600 * 1000;
    const recentCompletedTasks = filteredTasks.filter(
      (t) =>
        t.completed &&
        t.completedAt !== undefined &&
        t.completedAt >= thirtyDaysAgo &&
        t.completedAt <= args.periodEnd,
    );
    const activeDates = new Set<string>();
    for (const t of recentCompletedTasks) {
      activeDates.add(new Date(t.completedAt!).toDateString());
    }
    for (const e of eventsList) {
      activeDates.add(new Date(e.startTime).toDateString());
    }

    let streak = 0;
    const checkDate = new Date(args.periodEnd);
    while (activeDates.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // 5. Habit stats for the period
    const rawHabits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const filteredHabits = args.workspaceId
      ? rawHabits.filter((h) => h.workspaceId === args.workspaceId)
      : rawHabits;

    let habitLogsCompletedTotal = 0;
    let habitLogsSkippedTotal = 0;
    let habitStreakDaysTotal = 0;
    for (const h of filteredHabits) {
      if (!h.archived) {
        habitStreakDaysTotal = Math.max(habitStreakDaysTotal, h.currentStreak);
        const logs = await ctx.db
          .query("habitLogs")
          .withIndex("by_habit", (q) => q.eq("habitId", h._id))
          .collect();
        for (const l of logs) {
          if (
            l.dateString >=
              new Date(args.periodStart).toISOString().slice(0, 10) &&
            l.dateString <= new Date(args.periodEnd).toISOString().slice(0, 10)
          ) {
            if (l.status === "completed") habitLogsCompletedTotal++;
            else habitLogsSkippedTotal++;
          }
        }
      }
    }

    const formatTaskDate = (ts?: number) => {
      if (!ts) return "N/A";
      return new Date(ts).toLocaleString("en-US", { hour12: false });
    };

    const fmtDate = (t: { dueDateStr?: string; dueDate?: number }) =>
      t.dueDateStr || (t.dueDate ? formatTaskDate(t.dueDate) : "");

    const completedTasksDetails = tasksCompletedList
      .map((t) => {
        const createdStr = `Created: ${formatTaskDate(t._creationTime)}`;
        const dueStr = t.dueDateStr || t.dueDate ? `, Due: ${fmtDate(t)}` : "";
        const completedStr = t.completedAt
          ? `, Completed: ${formatTaskDate(t.completedAt)}`
          : "";
        return `- [Task] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}${completedStr}]${t.notes ? `\n  Notes: ${t.notes.split("\n").join("\n  ")}` : ""}`;
      })
      .join("\n");

    const eventsDetails = eventsList
      .map((e: ReflectionEventSummary) => {
        return `- [Event] ${e.title} at ${new Date(e.startTime).toLocaleTimeString()}${e.outcome ? ` (Outcome: ${e.outcome})` : ""}${e.cancelled ? " [CANCELLED]" : ""}`;
      })
      .join("\n");

    return {
      tasksCompleted: tasksCompletedList.length,
      tasksCreated: tasksCreatedList.length,
      eventsAttended: eventsList.filter(
        (e: ReflectionEventSummary) => !e.cancelled,
      ).length,
      habitLogsCompleted: habitLogsCompletedTotal,
      habitLogsSkipped: habitLogsSkippedTotal,
      habitStreakDays: habitStreakDaysTotal,
      topCategories,
      streakDays: streak,
      rawDetails: `COMPLETED TASKS:\n${completedTasksDetails || "None."}\n\nEVENTS IN PERIOD:\n${eventsDetails || "None."}\n\nHABITS COMPLETED: ${habitLogsCompletedTotal} | HABITS SKIPPED: ${habitLogsSkippedTotal} | BEST HABIT STREAK: ${habitStreakDaysTotal} day(s)\n\nCRITICAL TIMELINESS RULE: To evaluate if a task was completed fast or late, you MUST compare the Completion time against the Due Date, not the Creation time. A large gap between Creation and Completion does not mean the user procrastinated if the task was completed before its Due Date. Emphasize and heavily weight High Priority tasks in your summaries.`,
    };
  },
});

/**
 * Shared data collection for the Monday weekly cron.
 * Returns a single payload used by both OCEAN and Reflections prompts.
 */
export const compileWeeklyData = internalQuery({
  args: {
    userId: v.id("users"),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Tasks created/completed in this period
    const rawTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const tasksCreated = rawTasks.filter(
      (t) => t.createdAt >= args.periodStart && t.createdAt <= args.periodEnd,
    );
    const tasksCompleted = rawTasks.filter(
      (t) =>
        t.completed &&
        t.completedAt !== undefined &&
        t.completedAt >= args.periodStart &&
        t.completedAt <= args.periodEnd,
    );

    // 2. Events in this period (with recurring expansion)
    const rawEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const eventsList = expandRecurringEventsForWindow(
      rawEvents,
      args.periodStart,
      args.periodEnd,
    );

    // 3. Habit logs in this period
    const rawHabits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    let habitLogsCompleted = 0;
    let habitLogsSkipped = 0;
    for (const h of rawHabits) {
      if (!h.archived) {
        const logs = await ctx.db
          .query("habitLogs")
          .withIndex("by_habit", (q) => q.eq("habitId", h._id))
          .collect();
        for (const l of logs) {
          if (
            l.dateString >=
              new Date(args.periodStart).toISOString().slice(0, 10) &&
            l.dateString <= new Date(args.periodEnd).toISOString().slice(0, 10)
          ) {
            if (l.status === "completed") habitLogsCompleted++;
            else habitLogsSkipped++;
          }
        }
      }
    }

    // 4. Daily session summaries for this period
    const sessionSummaries = await ctx.db
      .query("sessionSummaries")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
      .collect();

    const filteredSummaries = sessionSummaries.filter((s) => {
      const date = new Date(s.date + "T00:00:00");
      const ts = date.getTime();
      return ts >= args.periodStart && ts <= args.periodEnd;
    });

    // 5. Category count
    const categoryCounts: Record<string, number> = {};
    for (const t of tasksCompleted) {
      if (t.category) {
        categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      }
    }
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((entry) => entry[0]);

    // 6. Streak calculation
    const thirtyDaysAgo = args.periodEnd - 30 * 24 * 3600 * 1000;
    const recentCompleted = rawTasks.filter(
      (t) =>
        t.completed &&
        t.completedAt !== undefined &&
        t.completedAt >= thirtyDaysAgo &&
        t.completedAt <= args.periodEnd,
    );
    const activeDates = new Set<string>();
    for (const t of recentCompleted) {
      activeDates.add(new Date(t.completedAt!).toDateString());
    }
    for (const e of eventsList) {
      activeDates.add(new Date(e.startTime).toDateString());
    }
    let streak = 0;
    const checkDate = new Date(args.periodEnd);
    while (activeDates.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Build formatted details for LLM consumption
    const formatTaskDate = (ts?: number) => {
      if (!ts) return "N/A";
      return new Date(ts).toLocaleString("en-US", { hour12: false });
    };

    const fmtDate = (t: { dueDateStr?: string; dueDate?: number }) =>
      t.dueDateStr || (t.dueDate ? formatTaskDate(t.dueDate) : "");

    const completedTasksDetails = tasksCompleted
      .map((t) => {
        const createdStr = `Created: ${formatTaskDate(t._creationTime)}`;
        const dueStr = t.dueDateStr || t.dueDate ? `, Due: ${fmtDate(t)}` : "";
        const completedStr = t.completedAt
          ? `, Completed: ${formatTaskDate(t.completedAt)}`
          : "";
        return `- [Task] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}${completedStr}]${t.notes ? `\n  Notes: ${t.notes.split("\n").join("\n  ")}` : ""}`;
      })
      .join("\n");

    const createdTasksDetails = tasksCreated
      .filter((t) => !t.completed)
      .map((t) => {
        const createdStr = `Created: ${formatTaskDate(t._creationTime)}`;
        const dueStr = t.dueDateStr || t.dueDate ? `, Due: ${fmtDate(t)}` : "";
        return `- [Task] ${t.text} (Priority: ${t.priority || "medium"}, Category: ${t.category || "General"}) [${createdStr}${dueStr}]${t.notes ? `\n  Notes: ${t.notes.split("\n").join("\n  ")}` : ""}`;
      })
      .join("\n");

    const eventsDetails = eventsList
      .map((e: ReflectionEventSummary) => {
        return `- [Event] ${e.title} at ${new Date(e.startTime).toLocaleTimeString()}${e.outcome ? ` (Outcome: ${e.outcome})` : ""}${e.cancelled ? " [CANCELLED]" : ""}`;
      })
      .join("\n");

    const summariesText = filteredSummaries
      .map((s) => `[${s.date}]: ${s.summary}`)
      .join("\n");

    return {
      tasksCompleted: tasksCompleted.length,
      tasksCreated: tasksCreated.length,
      eventsAttended: eventsList.filter(
        (e: ReflectionEventSummary) => !e.cancelled,
      ).length,
      habitLogsCompleted,
      habitLogsSkipped,
      topCategories,
      streakDays: streak,
      rawDetails: [
        `COMPLETED TASKS (${tasksCompleted.length}):\n${completedTasksDetails || "None."}`,
        `PENDING/INCOMPLETE TASKS (${tasksCreated.length - tasksCompleted.length}):\n${createdTasksDetails || "None."}`,
        `EVENTS (${eventsList.length}):\n${eventsDetails || "None."}`,
        `HABITS: Completed: ${habitLogsCompleted} | Skipped: ${habitLogsSkipped}`,
        `DAILY SESSION SUMMARIES:\n${summariesText || "No session summaries recorded."}`,
      ].join("\n\n"),
    };
  },
});

/**
 * Weekly Reflection cron: fires on each user's local Monday.
 * Runs every hour, schedules users at their local Monday.
 * Uses idempotency check to prevent 24x spam.
 */
export const cronTriggerWeeklyReflection = internalMutation({
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

      const timezone = lastSession?.timezone || "UTC";

      // Check if it's Monday in the user's local time
      const localDay = getLocalDayOfWeek(timezone);
      if (localDay !== 1) continue; // Not Monday

      // Calculate this Monday's start time (epoch ms)
      const localDateStr = getLocalDateString(timezone);
      const [year, month, day] = localDateStr.split("-").map(Number);
      const offset = getOffsetMinutes(timezone);

      const today = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = today.getUTCDay();
      const daysSinceMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
      const mondayStart = monday.getTime() - offset * 60000;

      // Idempotency check: does a weekly reflection already exist for this Monday?
      const existing = await ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", user._id).eq("type", "weekly"),
        )
        .filter((q) => q.eq(q.field("periodStart"), mondayStart))
        .first();

      if (existing) continue; // Already generated this week

      await ctx.scheduler.runAfter(0, internal.background_jobs.generateCronReflection, {
        userId: user._id,
        type: "weekly",
        timezone,
      });
    }
  },
});

/**
 * Yearly Reflection cron: fires on December 27-30 (last week of December).
 * Checks each user's LOCAL date (not UTC) to determine if it's Dec 27-30.
 * Uses idempotency check to prevent duplicates.
 *
 * Why Dec 27-30 instead of 28-31?
 * Users in UTC+13 (e.g., Pacific/Auckland) would be on Jan 1 when UTC is Dec 31.
 * Firing on Dec 27-30 ensures ALL users are still in December when the cron runs.
 * The period still covers Jan 1 → Dec 31 (cap removed for yearly in getPeriodRange).
 */
export const cronTriggerYearlyReflection = internalMutation({
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
      const timezone = lastSession?.timezone || "UTC";

      // Check if it's December 27-30 in the user's LOCAL time (not UTC)
      const localDateStr = getLocalDateString(timezone);
      const [localYear, localMonth, localDay] = localDateStr.split("-").map(Number);

      if (localMonth !== 12 || localDay < 27 || localDay > 30) continue;

      // Calculate this year's January 1 start time (epoch ms)
      const jan1Start = Date.UTC(localYear, 0, 1, 0, 0, 0, 0);

      // Idempotency check: does a yearly reflection already exist for this year?
      const existing = await ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", user._id).eq("type", "yearly"),
        )
        .filter((q) => q.eq(q.field("periodStart"), jan1Start))
        .first();

      if (existing) continue; // Already generated this year

      await ctx.scheduler.runAfter(0, internal.background_jobs.generateCronReflection, {
        userId: user._id,
        type: "yearly",
        timezone,
      });
    }
  },
});

/**
 * Monthly Reflection cron: fires on the 1st of every month.
 * Checks each user's LOCAL date (not UTC) to determine if it's the 1st.
 * Generates a reflection for the previous month.
 */
export const cronTriggerMonthlyReflection = internalMutation({
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
      const timezone = lastSession?.timezone || "UTC";

      // Check if it's the 1st of the month in the user's LOCAL time
      const localDateStr = getLocalDateString(timezone);
      const [localYear, localMonth, localDay] = localDateStr.split("-").map(Number);
      if (localDay !== 1) continue;

      // Calculate previous month's start (epoch ms)
      const prevMonth = localMonth === 1 ? 12 : localMonth - 1;
      const prevYear = localMonth === 1 ? localYear - 1 : localYear;
      const periodStart = Date.UTC(prevYear, prevMonth - 1, 1, 0, 0, 0, 0);

      // Idempotency check: does a monthly reflection already exist for this period?
      const existing = await ctx.db
        .query("reflections")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", user._id).eq("type", "monthly"),
        )
        .filter((q) => q.eq(q.field("periodStart"), periodStart))
        .first();

      if (existing) continue;

      await ctx.scheduler.runAfter(0, internal.background_jobs.generateCronReflection, {
        userId: user._id,
        type: "monthly",
        timezone,
      });
    }
  },
});
