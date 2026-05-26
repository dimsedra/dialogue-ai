import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const seedTestWeek = mutation({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    let userId = args.userId;
    if (!userId) {
      const authedUserId = await auth.getUserId(ctx);
      if (!authedUserId) throw new Error("Unauthorized. Pass userId as argument or run from an authenticated session.");
      userId = authedUserId;
    }

    const day = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    // Get current streak count for habits
    // Tasks
    const taskIds = [];
    for (let i = 0; i < 5; i++) {
      const offset = i * day;
      taskIds.push(await ctx.db.insert("tasks", {
        userId,
        text: ["Design landing page mockup", "Fix auth race condition", "Write API docs", "Review PR backlog", "Plan Q3 roadmap"][i],
        completed: i < 3,
        completedAt: i < 3 ? todayTs - offset : undefined,
        createdAt: todayTs - offset - 3600000,
        notes: `[${new Date(todayTs - offset).toISOString().slice(0, 10)} 14:00] ${["Struggled with layout but got it right", "Found the root cause — async edge case", "Docs almost done, need one more section", "Reviewed 12 PRs, approved 8", "Drafted initial roadmap"][i]}`,
        progress: i < 3 ? 100 : [40, 70][i - 3],
        category: ["Design", "Dev", "Dev", "Dev", "Management"][i],
        priority: i < 2 ? "high" : "medium",
      }));
    }

    // Habits
    const habitId = await ctx.db.insert("habits", {
      userId,
      name: "Morning Run",
      description: "30 min run around the park",
      frequency: "daily",
      frequencyConfig: {},
      currentStreak: 3,
      longestStreak: 12,
      lastLoggedDate: new Date(todayTs - day).toISOString().slice(0, 10),
      archived: false,
      createdAt: todayTs,
    });

    // Log 5 days of habit (3 completed, 2 skipped)
    for (let i = 0; i < 5; i++) {
      const date = new Date(todayTs - i * day);
      const dateStr = date.toISOString().slice(0, 10);
      const isCompleted = i < 3;
      await ctx.db.insert("habitLogs", {
        userId,
        habitId,
        dateString: dateStr,
        status: isCompleted ? "completed" : "skipped",
        notes: isCompleted
          ? `[${dateStr} 07:30] Good run, felt energetic.`
          : `[${dateStr} 07:30] Skipped — ${i === 3 ? "exhausted from late work" : "rained out"}`,
        timestamp: todayTs - i * day + 27000000, // 7:30 AM
      });
    }

    // Events
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1));
    monday.setHours(10, 0, 0, 0);

    const events = [];
    events.push(await ctx.db.insert("events", {
      userId,
      title: "Sprint Planning",
      startTime: monday.getTime(),
      endTime: monday.getTime() + 3600000,
      eventType: "interval",
      notes: `[${monday.toISOString().slice(0, 10)} 10:00] Planned sprint 14. Team agreed on scope.`,
      statusHook: "Sprint planned successfully",
      createdAt: todayTs,
    }));

    events.push(await ctx.db.insert("events", {
      userId,
      title: "Design Review",
      startTime: monday.getTime() + 2 * day + 54000000, // Wednesday 3PM
      endTime: monday.getTime() + 2 * day + 57600000,
      eventType: "interval",
      notes: `[${new Date(monday.getTime() + 2 * day).toISOString().slice(0, 10)} 15:00] Reviewed new landing page design. Approved with minor changes.`,
      outcome: "Design approved, minor tweaks needed.",
      statusHook: "Design review completed",
      createdAt: todayTs,
    }));

    // Recurring: Weekly Retro (Fridays)
    const retros = monday.getTime() + ((5 - (monday.getDay() || 7) + 7) % 7) * day;
    const retroId = await ctx.db.insert("events", {
      userId,
      title: "Weekly Retro",
      startTime: retros,
      endTime: retros + 1800000,
      eventType: "interval",
      notes: "[2026-05-22 10:00] Previous retro.",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [5],
        until: todayTs + 365 * day,
      },
      createdAt: todayTs,
    });

    // Cancel THIS week's retro
    const exceptions = [retros];
    await ctx.db.patch(retroId, {
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [5],
        until: todayTs + 365 * day,
        exceptions,
      },
    });

    return {
      tasksCreated: taskIds.length,
      eventsCreated: events.length + 1,
      recurringWithCancellation: 1,
      habitsCreated: 1,
      habitLogsCreated: 5,
    };
  },
});

export const seedTestReflections = mutation({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    let userId = args.userId;
    if (!userId) {
      const authedUserId = await auth.getUserId(ctx);
      if (!authedUserId) throw new Error("Unauthorized");
      userId = authedUserId;
    }

    const week = 7 * 86400000;
    const now = Date.now();
    const today = new Date();
    const currentDayOfWeek = today.getDay() || 7; // 1=Mon ... 7=Sun

    for (let i = 0; i < 4; i++) {
      const weekStart = now - (i + 1) * week - (currentDayOfWeek - 1) * 86400000;
      const weekEnd = weekStart + week - 1;

      await ctx.db.insert("reflections", {
        userId,
        type: "weekly",
        periodStart: weekStart,
        periodEnd: weekEnd,
        periodLabel: `Test Week ${4 - i}`,
        summary: `Test weekly summary for week ${4 - i} with habits.`,
        stats: {
          tasksCompleted: 3 + i,
          tasksCreated: 5 + i,
          eventsAttended: 2,
          topCategories: ["Dev", "General"],
          streakDays: 5 + i,
          habitLogsCompleted: 3 + i,
          habitLogsSkipped: 1,
          habitStreakDays: 7 + i,
        },
        createdAt: now,
      });
    }

    return { weeklyReflectionsCreated: 4 };
  },
});
