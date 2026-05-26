import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

// --- Streak Calculation Helper ---
const parseDateString = (ds: string) => {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function calculateNewStreak(
  habit: {
    frequency: "daily" | "custom";
    frequencyConfig?: { daysOfWeek?: number[] };
    currentStreak: number;
    longestStreak: number;
    lastLoggedDate?: string;
  },
  logDateString: string,
  logStatus: "completed" | "skipped",
  skippedDates: Set<string>
): { currentStreak: number; longestStreak: number } {
  const current = parseDateString(logDateString);
  if (!habit.lastLoggedDate) {
    const initialStreak = logStatus === "completed" ? 1 : 0;
    return {
      currentStreak: initialStreak,
      longestStreak: Math.max(initialStreak, habit.longestStreak),
    };
  }

  const prev = parseDateString(habit.lastLoggedDate);
  const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    // Back-logging or duplicate date, don't change streak
    return {
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
    };
  }

  // Verify if the gap (> 1 day) was preserved (all intermediate active days were skipped/unscheduled)
  let preserved = true;
  if (diffDays > 1) {
    for (let i = 1; i < diffDays; i++) {
      const cursor = new Date(prev);
      cursor.setDate(prev.getDate() + i);
      const cursorDateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;

      let isScheduled = true;
      if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
        isScheduled = habit.frequencyConfig.daysOfWeek.includes(cursor.getDay());
      }

      if (isScheduled && !skippedDates.has(cursorDateStr)) {
        preserved = false;
        break;
      }
    }
  }

  if (logStatus === "skipped") {
    // Skipped logs freeze the streak (0 if broken, otherwise currentStreak)
    const nextStreak = preserved ? habit.currentStreak : 0;
    return {
      currentStreak: nextStreak,
      longestStreak: Math.max(nextStreak, habit.longestStreak),
    };
  } else {
    // Completed logs increment the streak (1 if broken, otherwise currentStreak + 1)
    const nextStreak = preserved ? habit.currentStreak + 1 : 1;
    return {
      currentStreak: nextStreak,
      longestStreak: Math.max(nextStreak, habit.longestStreak),
    };
  }
}

export function isStreakActive(
  habit: {
    frequency: "daily" | "custom";
    frequencyConfig?: { daysOfWeek?: number[] };
    lastLoggedDate?: string;
  },
  todayDateString: string,
  skippedDates: Set<string>
): boolean {
  if (!habit.lastLoggedDate) return true;

  const prev = parseDateString(habit.lastLoggedDate);
  const current = parseDateString(todayDateString);
  const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return true;

  for (let i = 1; i < diffDays; i++) {
    const cursor = new Date(prev);
    cursor.setDate(prev.getDate() + i);
    const cursorDateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;

    let isScheduled = true;
    if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
      isScheduled = habit.frequencyConfig.daysOfWeek.includes(cursor.getDay());
    }

    if (isScheduled && !skippedDates.has(cursorDateStr)) {
      return false;
    }
  }

  return true;
}

export async function recalculateHabitStreak(
  ctx: MutationCtx,
  habitId: Id<"habits">
) {
  const habit = await ctx.db.get(habitId);
  if (!habit) return;

  const logs = await ctx.db
    .query("habitLogs")
    .withIndex("by_habit", (q) => q.eq("habitId", habitId))
    .collect();

  // Sort logs chronologically
  logs.sort((a, b) => a.dateString.localeCompare(b.dateString));

  let currentStreak = 0;
  let longestStreak = 0;
  let lastLoggedDate: string | undefined = undefined;

  const skippedDates = new Set<string>(
    logs.filter((l) => l.status === "skipped").map((l) => l.dateString)
  );

  for (const log of logs) {
    const result = calculateNewStreak(
      {
        frequency: habit.frequency,
        frequencyConfig: habit.frequencyConfig,
        currentStreak,
        longestStreak,
        lastLoggedDate,
      },
      log.dateString,
      log.status,
      skippedDates
    );
    currentStreak = result.currentStreak;
    longestStreak = result.longestStreak;
    lastLoggedDate = log.dateString;
  }

  await ctx.db.patch(habitId, {
    currentStreak,
    longestStreak,
    lastLoggedDate,
    lastLoggedAt: Date.now(),
  });
}

// --- Public Mutations and Queries ---

export const createHabit = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    frequency: v.union(v.literal("daily"), v.literal("custom")),
    frequencyConfig: v.object({
      daysOfWeek: v.optional(v.array(v.number())),
    }),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("habits", {
      userId,
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      frequency: args.frequency,
      frequencyConfig: args.frequencyConfig,
      currentStreak: 0,
      longestStreak: 0,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const logHabit = mutation({
  args: {
    habitId: v.id("habits"),
    dateString: v.string(), // "YYYY-MM-DD"
    status: v.union(v.literal("completed"), v.literal("skipped")),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const habit = await ctx.db.get(args.habitId);
    if (!habit || habit.userId !== userId) {
      throw new Error("Habit not found or unauthorized");
    }

    // Check unique constraint for this day
    const existingLog = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_dateString", (q) =>
        q.eq("habitId", args.habitId).eq("dateString", args.dateString)
      )
      .unique();

    let logId;
    if (existingLog) {
      if (existingLog.status === args.status) {
        if (args.notes !== undefined) {
          // Same status but notes provided — patch notes only, do NOT toggle off
          await ctx.db.patch(existingLog._id, { notes: args.notes });
          logId = existingLog._id;
        } else {
          // Toggle off: same status clicked with no notes
          await ctx.db.delete(existingLog._id);
          logId = null;
        }
      } else {
        // Switch status: update existing log status/notes
        await ctx.db.patch(existingLog._id, {
          status: args.status,
          notes: args.notes ?? existingLog.notes,
          timestamp: Date.now(),
        });
        logId = existingLog._id;
      }
    } else {
      // Write log entry
      logId = await ctx.db.insert("habitLogs", {
        userId,
        habitId: args.habitId,
        timestamp: Date.now(),
        dateString: args.dateString,
        status: args.status,
        notes: args.notes,
      });
    }

    // Recalculate streak from all logs and update habit cached aggregates
    await recalculateHabitStreak(ctx, args.habitId);

    return logId;
  },
});

export const getHabits = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.id("users")),
    todayDateString: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    let habitsQuery = ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const allHabits = await habitsQuery.collect();

    // Filter by workspace & archived status
    const activeHabits = allHabits.filter(
      (h) => h.workspaceId === args.workspaceId && !h.archived
    );

    // Jointly fetch the last 30 logs for each habit to avoid N+1 query loops
    const enrichedHabits = await Promise.all(
      activeHabits.map(async (habit) => {
        const logs = await ctx.db
          .query("habitLogs")
          .withIndex("by_habit", (q) => q.eq("habitId", habit._id))
          .order("desc")
          .take(30);

        let currentStreak = habit.currentStreak;
        if (args.todayDateString) {
          const skippedDates = new Set(
            logs.filter((l) => l.status === "skipped").map((l) => l.dateString)
          );
          const active = isStreakActive(habit, args.todayDateString, skippedDates);
          if (!active) {
            currentStreak = 0;
          }
        }

        return {
          ...habit,
          currentStreak,
          recentLogs: logs.map((l) => ({
            dateString: l.dateString,
            status: l.status,
            notes: l.notes,
          })),
        };
      })
    );

    return enrichedHabits;
  },
});

export const getHabitConsistency = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    periodStartDate: v.string(), // "YYYY-MM-DD"
    periodEndDate: v.string(),   // "YYYY-MM-DD"
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return [];

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const activeHabits = habits.filter(
      (h) => h.workspaceId === args.workspaceId && !h.archived
    );

    const reports = [];
    for (const habit of activeHabits) {
      const logs = await ctx.db
        .query("habitLogs")
        .withIndex("by_habit", (q) => q.eq("habitId", habit._id))
        .collect();

      const rangeLogs = logs.filter(
        (l) => l.dateString >= args.periodStartDate && l.dateString <= args.periodEndDate
      );

      const completedCount = rangeLogs.filter((l) => l.status === "completed").length;
      const skippedCount = rangeLogs.filter((l) => l.status === "skipped").length;

      reports.push({
        habitId: habit._id,
        name: habit.name,
        currentStreak: habit.currentStreak,
        longestStreak: habit.longestStreak,
        completedCount,
        skippedCount,
      });
    }

    return reports;
  },
});

export const get = query({
  args: {
    id: v.id("habits"),
    userId: v.optional(v.id("users")),
    todayDateString: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) return null;
    const habit = await ctx.db.get(args.id);
    if (!habit || habit.userId !== userId) return null;

    let currentStreak = habit.currentStreak;
    if (args.todayDateString) {
      const logs = await ctx.db
        .query("habitLogs")
        .withIndex("by_habit", (q) => q.eq("habitId", habit._id))
        .collect();
      const skippedDates = new Set(
        logs.filter((l) => l.status === "skipped").map((l) => l.dateString)
      );
      const active = isStreakActive(habit, args.todayDateString, skippedDates);
      if (!active) {
        currentStreak = 0;
      }
    }

    return {
      ...habit,
      currentStreak,
    };
  },
});
