import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

// --- YYYY-MM-DD string helpers (no epoch ms) ---
const dateParts = (ds: string) => {
  const [y, m, d] = ds.split("-").map(Number);
  return { y, m: m - 1, d };
};

const utcDate = (ds: string) => {
  const { y, m, d } = dateParts(ds);
  return new Date(Date.UTC(y, m, d));
};

const formatYMD = (dt: Date) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;

const addDays = (ds: string, n: number): string => {
  const { y, m, d } = dateParts(ds);
  return formatYMD(new Date(Date.UTC(y, m, d + n)));
};

const daysBetween = (a: string, b: string): number => {
  const aMs = Date.UTC(...Object.values(dateParts(a)) as [number, number, number]);
  const bMs = Date.UTC(...Object.values(dateParts(b)) as [number, number, number]);
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
};

const getDayOfWeek = (ds: string): number => utcDate(ds).getUTCDay();

const getRolling7Days = (todayStr: string) => {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(todayStr, -i));
  }
  return dates;
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
  if (!habit.lastLoggedDate) {
    const initialStreak = logStatus === "completed" ? 1 : 0;
    return {
      currentStreak: initialStreak,
      longestStreak: Math.max(initialStreak, habit.longestStreak),
    };
  }

  const diffDays = daysBetween(logDateString, habit.lastLoggedDate);

  if (diffDays <= 0) {
    return {
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
    };
  }

  let preserved = true;
  if (diffDays > 1) {
    for (let i = 1; i < diffDays; i++) {
      const cursorDateStr = addDays(habit.lastLoggedDate, i);

      let isScheduled = true;
      if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
        isScheduled = habit.frequencyConfig.daysOfWeek.includes(getDayOfWeek(cursorDateStr));
      }

      if (isScheduled && !skippedDates.has(cursorDateStr)) {
        preserved = false;
        break;
      }
    }
  }

  if (logStatus === "skipped") {
    const nextStreak = preserved ? habit.currentStreak : 0;
    return {
      currentStreak: nextStreak,
      longestStreak: Math.max(nextStreak, habit.longestStreak),
    };
  } else {
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

  const diffDays = daysBetween(todayDateString, habit.lastLoggedDate);

  if (diffDays <= 1) return true;

  for (let i = 1; i < diffDays; i++) {
    const cursorDateStr = addDays(habit.lastLoggedDate, i);

    let isScheduled = true;
    if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
      isScheduled = habit.frequencyConfig.daysOfWeek.includes(getDayOfWeek(cursorDateStr));
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
    timezone: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const habit = await ctx.db.get(args.habitId);
    if (!habit || habit.userId !== userId) {
      throw new Error("Habit not found or unauthorized");
    }

    // Check if a log already exists for this date
    const existingLog = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_dateString", (q) =>
        q.eq("habitId", args.habitId).eq("dateString", args.dateString)
      )
      .unique();

    // Format timestamp prefix using IANA timezone
    const now = new Date();
    const tz = args.timezone || "UTC";
    const datePart = now.toLocaleDateString("en-CA", { timeZone: tz });
    const timePart = now.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
    const ts = `[${datePart} ${timePart}]`;

    let logId;
    if (existingLog) {
      if (existingLog.status === args.status) {
        // Same status clicked again — idempotent. Do nothing, preserve notes.
        if (args.notes !== undefined) {
          // Append notes with timestamp
          const timestampedNote = `${ts} ${args.notes.trim()}`;
          const updatedNotes = existingLog.notes
            ? `${existingLog.notes}\n${timestampedNote}`
            : timestampedNote;
          await ctx.db.patch(existingLog._id, {
            notes: updatedNotes,
            timestamp: Date.now(),
          });
        }
        logId = existingLog._id;
      } else {
        // Switch status: update existing log status
        await ctx.db.patch(existingLog._id, {
          status: args.status,
          timestamp: Date.now(),
        });
        logId = existingLog._id;
      }
    } else {
      // Write log entry with timestamped notes
      const timestampedNote = args.notes ? `${ts} ${args.notes.trim()}` : undefined;
      logId = await ctx.db.insert("habitLogs", {
        userId,
        habitId: args.habitId,
        timestamp: Date.now(),
        dateString: args.dateString,
        status: args.status,
        notes: timestampedNote,
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
      (h) => (args.workspaceId ? h.workspaceId === args.workspaceId : true) && !h.archived
    );

    const todayStr = args.todayDateString ?? (() => {
      const now = new Date();
      return now.toLocaleDateString("en-CA", { timeZone: "UTC" });
    })();

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

        // Compute rolling weekly completion metrics
        const last7Days = getRolling7Days(todayStr);
        let completedCount = 0;
        let scheduledCount = 0;

        for (const dateStr of last7Days) {
          const [y, m, d] = dateStr.split("-").map(Number);
          const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

          let isScheduled = true;
          if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
            isScheduled = habit.frequencyConfig.daysOfWeek.includes(dayOfWeek);
          }

          if (isScheduled) {
            scheduledCount++;
            const log = logs.find((l) => l.dateString === dateStr);
            if (log && log.status === "completed") {
              completedCount++;
            }
          }
        }

        const weeklyRate = scheduledCount > 0
          ? Math.round((completedCount / scheduledCount) * 100)
          : 0;

        return {
          ...habit,
          currentStreak,
          weeklyRate,
          weeklyStats: {
            completed: completedCount,
            scheduled: scheduledCount,
          },
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
      (h) => (args.workspaceId ? h.workspaceId === args.workspaceId : true) && !h.archived
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

export const updateHabit = mutation({
  args: {
    id: v.id("habits"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    frequency: v.optional(v.union(v.literal("daily"), v.literal("custom"))),
    frequencyConfig: v.optional(v.object({
      daysOfWeek: v.optional(v.array(v.number())),
    })),
    workspaceId: v.optional(v.union(v.id("workspaces"), v.null())),
    archived: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const habit = await ctx.db.get(args.id);
    if (!habit || habit.userId !== userId) {
      throw new Error("Habit not found or unauthorized");
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.frequencyConfig !== undefined) updates.frequencyConfig = args.frequencyConfig;
    if (args.workspaceId !== undefined) {
      updates.workspaceId = args.workspaceId === null ? undefined : args.workspaceId;
    }
    if (args.archived !== undefined) updates.archived = args.archived;

    await ctx.db.patch(args.id, updates);

    if (args.frequency !== undefined || args.frequencyConfig !== undefined) {
      await recalculateHabitStreak(ctx, args.id);
    }
  },
});

export const archiveHabit = mutation({
  args: {
    id: v.id("habits"),
    archived: v.boolean(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const habit = await ctx.db.get(args.id);
    if (!habit || habit.userId !== userId) {
      throw new Error("Habit not found or unauthorized");
    }

    await ctx.db.patch(args.id, { archived: args.archived });
  },
});

export const deleteHabit = mutation({
  args: {
    id: v.id("habits"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await auth.getUserId(ctx));
    if (!userId) throw new Error("Unauthorized");

    const habit = await ctx.db.get(args.id);
    if (!habit || habit.userId !== userId) {
      throw new Error("Habit not found or unauthorized");
    }

    const logs = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit", (q) => q.eq("habitId", args.id))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    await ctx.db.delete(args.id);
  },
});
