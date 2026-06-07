import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import {
  habitsListRawQuery,
  habitsGetQuery,
  habitLogsListRecentQuery,
  habitsGetHabitConsistencyQuery,
} from "../descriptors/habits";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PbHabits, PbHabitLogs } from "../_generated/dataModel";

// --- Date helpers matching convex/habits.ts ---
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
  const aParts = dateParts(a);
  const bParts = dateParts(b);
  const aMs = Date.UTC(aParts.y, aParts.m, aParts.d);
  const bMs = Date.UTC(bParts.y, bParts.m, bParts.d);
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

export function isStreakActive(
  habit: {
    frequency: "daily" | "custom";
    frequencyConfig?: { daysOfWeek?: number[] };
    lastLoggedDate?: string;
  },
  todayDateString: string,
  skippedDates: Set<string>,
): boolean {
  if (!habit.lastLoggedDate) return true;

  const diffDays = daysBetween(todayDateString, habit.lastLoggedDate);

  if (diffDays <= 1) return true;

  for (let i = 1; i < diffDays; i++) {
    const cursorDateStr = addDays(habit.lastLoggedDate, i);

    let isScheduled = true;
    if (habit.frequency === "custom" && habit.frequencyConfig?.daysOfWeek) {
      isScheduled = habit.frequencyConfig.daysOfWeek.includes(
        getDayOfWeek(cursorDateStr),
      );
    }

    if (isScheduled && !skippedDates.has(cursorDateStr)) {
      return false;
    }
  }

  return true;
}

export function mapHabit(pb: PbHabits): Doc<"habits"> {
  return {
    _id: pb.id as unknown as Doc<"habits">["_id"],
    _creationTime: pb.createdAt,
    userId: pb.user as unknown as Doc<"habits">["userId"],
    workspaceId: pb.workspace as unknown as Doc<"habits">["workspaceId"],
    name: pb.name,
    description: pb.description,
    frequency: pb.frequency,
    frequencyConfig: pb.frequencyConfig,
    currentStreak: pb.currentStreak,
    longestStreak: pb.longestStreak,
    lastLoggedAt: pb.lastLoggedAt,
    lastLoggedDate: pb.lastLoggedDate,
    archived: pb.archived,
    createdAt: pb.createdAt,
  } as unknown as Doc<"habits">;
}

export function mapHabitLog(pb: PbHabitLogs): Doc<"habitLogs"> {
  return {
    _id: pb.id as unknown as Doc<"habitLogs">["_id"],
    _creationTime: pb.timestamp,
    userId: pb.user as unknown as Doc<"habitLogs">["userId"],
    habitId: pb.habit as unknown as Doc<"habitLogs">["habitId"],
    timestamp: pb.timestamp,
    dateString: pb.dateString,
    status: pb.status,
    notes: pb.notes,
  } as unknown as Doc<"habitLogs">;
}

export function usePbHabitsList(args?: {
  workspaceId?: string;
  todayDateString?: string;
}): (Doc<"habits"> & {
  weeklyRate: number;
  weeklyStats: { completed: number; scheduled: number };
  recentLogs: Array<{ dateString: string; status: "completed" | "skipped"; notes?: string }>;
})[] | undefined {
  const { user } = useAuth();
  const habits = useQuery(
    habitsListRawQuery,
    user ? { userId: user.id, workspaceId: args?.workspaceId } : undefined,
  );
  const habitLogs = useQuery(
    habitLogsListRecentQuery,
    user ? { userId: user.id } : undefined,
  );

  if (habits === undefined || habitLogs === undefined) return undefined;
  if (!user) return [];

  const todayStr =
    args?.todayDateString ??
    (() => {
      const now = new Date();
      return now.toLocaleDateString("en-CA", { timeZone: "UTC" });
    })();

  return habits.map((habit) => {
    const logs = habitLogs.filter((l) => l.habit === habit.id).slice(0, 30);
    let currentStreak = habit.currentStreak;

    if (args?.todayDateString) {
      const skippedDates = new Set(
        logs.filter((l) => l.status === "skipped").map((l) => l.dateString),
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
      if (
        habit.frequency === "custom" &&
        habit.frequencyConfig?.daysOfWeek
      ) {
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

    const weeklyRate =
      scheduledCount > 0
        ? Math.round((completedCount / scheduledCount) * 100)
        : 0;

    const mapped = mapHabit(habit);
    return {
      ...mapped,
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
  });
}

export function usePbHabit(
  id: string | undefined,
  args?: { todayDateString?: string },
): Doc<"habits"> | null | undefined {
  const { user } = useAuth();
  const habit = useQuery(
    habitsGetQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  const habitLogs = useQuery(
    habitLogsListRecentQuery,
    user ? { userId: user.id } : undefined,
  );

  if (habit === undefined || habitLogs === undefined) return undefined;
  if (habit === null) return null;

  let currentStreak = habit.currentStreak;
  if (args?.todayDateString) {
    const logs = habitLogs.filter((l) => l.habit === habit.id).slice(0, 30);
    const skippedDates = new Set(
      logs.filter((l) => l.status === "skipped").map((l) => l.dateString),
    );
    const active = isStreakActive(habit, args.todayDateString, skippedDates);
    if (!active) {
      currentStreak = 0;
    }
  }

  const mapped = mapHabit(habit);
  return {
    ...mapped,
    currentStreak,
  };
}

export function usePbHabitConsistency(args: {
  workspaceId?: string;
  periodStartDate: string;
  periodEndDate: string;
}): Array<{
  habitId: string;
  name: string;
  currentStreak: number;
  longestStreak: number;
  completedCount: number;
  skippedCount: number;
}> | undefined {
  const { user } = useAuth();
  const habits = useQuery(
    habitsListRawQuery,
    user ? { userId: user.id, workspaceId: args.workspaceId } : undefined,
  );
  const logsInRange = useQuery(
    habitsGetHabitConsistencyQuery,
    user
      ? {
          userId: user.id,
          workspaceId: args.workspaceId,
          periodStartDate: args.periodStartDate,
          periodEndDate: args.periodEndDate,
        }
      : undefined,
  );

  if (habits === undefined || logsInRange === undefined) return undefined;
  if (!user) return [];

  return habits.map((habit) => {
    const habitLogs = logsInRange.filter((l) => l.habit === habit.id);
    const completedCount = habitLogs.filter((l) => l.status === "completed").length;
    const skippedCount = habitLogs.filter((l) => l.status === "skipped").length;

    return {
      habitId: habit.id,
      name: habit.name,
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
      completedCount,
      skippedCount,
    };
  });
}
