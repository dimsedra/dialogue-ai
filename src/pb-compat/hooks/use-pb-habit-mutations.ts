import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbHabits, PbHabitLogs } from "../_generated/dataModel";

// --- YYYY-MM-DD string helpers ---
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
  const aMs = Date.UTC(...(Object.values(dateParts(a)) as [number, number, number]));
  const bMs = Date.UTC(...(Object.values(dateParts(b)) as [number, number, number]));
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
};

const getDayOfWeek = (ds: string): number => utcDate(ds).getUTCDay();

function calculateNewStreak(
  habit: {
    frequency: "daily" | "custom";
    frequencyConfig?: { daysOfWeek?: number[] };
    currentStreak: number;
    longestStreak: number;
    lastLoggedDate?: string;
  },
  logDateString: string,
  logStatus: "completed" | "skipped",
  skippedDates: Set<string>,
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

export function usePbHabitCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbHabits>({ collection: "habits", kind: "create" });
  return async (args: {
    name: string;
    description?: string;
    frequency: "daily" | "custom";
    frequencyConfig: { daysOfWeek?: number[] };
    workspaceId?: string;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      name: args.name,
      description: args.description || undefined,
      frequency: args.frequency,
      frequencyConfig: args.frequencyConfig,
      currentStreak: 0,
      longestStreak: 0,
      archived: false,
      workspace: (args.workspaceId || undefined) as any,
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbHabitLog() {
  const { user } = useAuth();
  const createLog = useMutation<PbHabitLogs>({ collection: "habit_logs", kind: "create" });
  const updateLog = useMutation<PbHabitLogs>({ collection: "habit_logs", kind: "update" });
  const updateHabit = useMutation<PbHabits>({ collection: "habits", kind: "update" });

  return async (args: {
    habitId: string;
    dateString: string;
    status: "completed" | "skipped";
    notes?: string;
    timezone?: string;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();

    const habit = await pb.collection("habits").getOne(args.habitId);
    if (!habit || habit.user !== user.id) throw new Error("Unauthorized");

    // Format timestamp prefix using IANA timezone
    const now = new Date();
    const tz = args.timezone || "UTC";
    const datePart = now.toLocaleDateString("en-CA", { timeZone: tz });
    const timePart = now.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const ts = `[${datePart} ${timePart}]`;

    // Check existing log
    const existingList = await pb.collection("habit_logs").getList(1, 1, {
      filter: `habit = "${args.habitId}" && dateString = "${args.dateString}"`,
    });
    const existingLog = existingList.items[0];

    let logId;
    if (existingLog) {
      if (existingLog.status === args.status) {
        if (args.notes !== undefined) {
          const timestampedNote = `${ts} ${args.notes.trim()}`;
          const updatedNotes = existingLog.notes
            ? `${existingLog.notes}\n${timestampedNote}`
            : timestampedNote;
          await updateLog({
            id: existingLog.id,
            record: {
              notes: updatedNotes,
              timestamp: Date.now(),
            },
          });
        }
        logId = existingLog.id;
      } else {
        await updateLog({
          id: existingLog.id,
          record: {
            status: args.status,
            timestamp: Date.now(),
          },
        });
        logId = existingLog.id;
      }
    } else {
      const timestampedNote = args.notes ? `${ts} ${args.notes.trim()}` : undefined;
      const created = await createLog({
        user: user.id as any,
        habit: args.habitId as any,
        timestamp: Date.now(),
        dateString: args.dateString,
        status: args.status,
        notes: timestampedNote || undefined,
      } as any);
      logId = created.id;
    }

    // Recalculate streak
    const logsList = await pb.collection("habit_logs").getList(1, 1000, {
      filter: `habit = "${args.habitId}"`,
    });
    const logs = logsList.items.sort((a, b) => a.dateString.localeCompare(b.dateString));

    let currentStreak = 0;
    let longestStreak = 0;
    let lastLoggedDate: string | undefined = undefined;

    const skippedDates = new Set<string>(
      logs.filter((l) => l.status === "skipped").map((l) => l.dateString),
    );

    const freqConfig = typeof habit.frequencyConfig === "string"
      ? JSON.parse(habit.frequencyConfig)
      : habit.frequencyConfig;

    for (const log of logs) {
      const result = calculateNewStreak(
        {
          frequency: habit.frequency as "daily" | "custom",
          frequencyConfig: freqConfig,
          currentStreak,
          longestStreak,
          lastLoggedDate,
        },
        log.dateString,
        log.status as "completed" | "skipped",
        skippedDates,
      );
      currentStreak = result.currentStreak;
      longestStreak = result.longestStreak;
      lastLoggedDate = log.dateString;
    }

    await updateHabit({
      id: args.habitId,
      record: {
        currentStreak,
        longestStreak,
        lastLoggedDate,
        lastLoggedAt: Date.now(),
      },
    });

    return logId;
  };
}

export function usePbHabitArchive() {
  const { user } = useAuth();
  const mutate = useMutation<PbHabits>({ collection: "habits", kind: "update" });
  return async (args: { id: string; archived: boolean }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({ id: args.id, record: { archived: args.archived } });
    return record;
  };
}

export function usePbHabitDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "habits", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });
  };
}
