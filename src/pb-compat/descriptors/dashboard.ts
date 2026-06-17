import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbId, PbTasks, PbHabits, PbHabitLogs, PbEvents, PbCardState } from "../_generated/dataModel";

export type DashboardTimeArgs = {
  timezone?: string;
  timezoneOffset?: number;
  userId?: string;
} | undefined;

export type ProactiveState =
  | {
      type: "attention_needed";
      priority: "overdue_task";
      taskId: PbId<"tasks">;
      taskTitle: string;
      overdueByDays: number;
    }
  | {
      type: "attention_needed";
      priority: "unchecked_habit";
      habitId: PbId<"habits">;
      habitName: string;
      streak: number;
    }
  | {
      type: "attention_needed";
      priority: "oldest_task";
      taskId: PbId<"tasks">;
      taskTitle: string;
      ageInDays: number;
    }
  | {
      type: "task_triage";
      count: number;
      taskIds: PbId<"tasks">[];
    }
  | {
      type: "habit_check";
      habitId: PbId<"habits">;
      habitName: string;
      streak: number;
      dateString: string;
    }
  | {
      type: "morning_brief";
      taskCount: number;
      eventCount: number;
      highlightTaskId?: PbId<"tasks">;
      highlightTaskTitle?: string;
    }
  | {
      type: "event_prep";
      eventId: PbId<"events">;
      eventTitle: string;
      startTime: number;
      notes?: string;
      resourceCount: number;
    }
  | {
      type: "evening_log";
      unloggedHabitIds: PbId<"habits">[];
      unloggedHabitNames: string[];
    }
  | {
      type: "all_caught_up";
    };

const pad2 = (value: number) => value.toString().padStart(2, "0");

const buildDateString = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(day)}`;

const parseDateString = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month: month - 1, day };
};

const shiftDateString = (dateString: string, days: number) => {
  const { year, month, day } = parseDateString(dateString);
  const shifted = new Date(Date.UTC(year, month, day + days));
  return buildDateString(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
};

const getDayOfWeek = (dateString: string) => {
  const { year, month, day } = parseDateString(dateString);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
};

const daysBetween = (a: string, b: string) => {
  const aParts = parseDateString(a);
  const bParts = parseDateString(b);
  const aMs = Date.UTC(aParts.year, aParts.month, aParts.day);
  const bMs = Date.UTC(bParts.year, bParts.month, bParts.day);
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
};

const getWeekStart = (dateString: string) =>
  shiftDateString(dateString, -getDayOfWeek(dateString));

const getTimeContextFromOffset = (
  timestamp: number,
  timezoneOffset: number,
): { dateString: string; hour: number } => {
  const local = new Date(timestamp - timezoneOffset * 60000);
  return {
    dateString: buildDateString(
      local.getUTCFullYear(),
      local.getUTCMonth() + 1,
      local.getUTCDate(),
    ),
    hour: local.getUTCHours(),
  };
};

const getPartValue = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) => Number(parts.find((part) => part.type === type)?.value ?? "0");

const getTimeContextFromTimeZone = (
  timestamp: number,
  timeZone: string,
): { dateString: string; hour: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

  return {
    dateString: buildDateString(
      getPartValue(parts, "year"),
      getPartValue(parts, "month"),
      getPartValue(parts, "day"),
    ),
    hour: getPartValue(parts, "hour"),
  };
};

const getTimeContext = (
  timestamp: number,
  timezone?: string,
  timezoneOffset?: number,
): { dateString: string; hour: number } => {
  if (timezone) {
    return getTimeContextFromTimeZone(timestamp, timezone);
  }

  if (timezoneOffset !== undefined) {
    return getTimeContextFromOffset(timestamp, timezoneOffset);
  }

  return {
    dateString: buildDateString(
      new Date(timestamp).getUTCFullYear(),
      new Date(timestamp).getUTCMonth() + 1,
      new Date(timestamp).getUTCDate(),
    ),
    hour: new Date(timestamp).getUTCHours(),
  };
};

const formatDateStringForTimestamp = (
  timestamp: number,
  timezone?: string,
  timezoneOffset?: number,
) => getTimeContext(timestamp, timezone, timezoneOffset).dateString;

const eventOccursOnDate = (
  event: PbEvents,
  targetDateString: string,
  timezone?: string,
  timezoneOffset?: number,
) => {
  if (!event.recurrence) {
    return (
      !event.cancelled &&
      formatDateStringForTimestamp(
        event.startTime,
        timezone,
        timezoneOffset,
      ) === targetDateString
    );
  }

  const eventStartDateString = formatDateStringForTimestamp(
    event.startTime,
    timezone,
    timezoneOffset,
  );

  if (targetDateString < eventStartDateString) {
    return false;
  }

  const untilDateString =
    event.recurrence.untilStr ||
    (event.recurrence.until !== undefined
      ? formatDateStringForTimestamp(
          event.recurrence.until,
          timezone,
          timezoneOffset,
        )
      : undefined);

  if (untilDateString && targetDateString > untilDateString) {
    return false;
  }

  if (event.recurrence.exceptionsStr?.includes(targetDateString)) {
    return false;
  }

  if (
    event.recurrence.exceptions?.some(
      (timestamp) =>
        formatDateStringForTimestamp(timestamp, timezone, timezoneOffset) ===
        targetDateString,
    )
  ) {
    return false;
  }

  if (event.recurrence.frequency === "daily") {
    const diffDays = daysBetween(targetDateString, eventStartDateString);
    return diffDays >= 0 && diffDays % event.recurrence.interval === 0;
  }

  const scheduledDays =
    event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
      ? event.recurrence.daysOfWeek
      : [getDayOfWeek(eventStartDateString)];

  if (!scheduledDays.includes(getDayOfWeek(targetDateString))) {
    return false;
  }

  const diffWeeks =
    daysBetween(getWeekStart(targetDateString), getWeekStart(eventStartDateString)) /
    7;

  return diffWeeks >= 0 && diffWeeks % event.recurrence.interval === 0;
};

const priorityWeight: Record<string, number> = {
  high: 1,
  medium: 2,
  low: 3,
};

const getHighlightedTask = (tasks: PbTasks[]) =>
  [...tasks].sort((a, b) => {
    const aPriority = priorityWeight[a.priority || "medium"] ?? 2;
    const bPriority = priorityWeight[b.priority || "medium"] ?? 2;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    if (a.dueDate !== undefined && b.dueDate !== undefined) {
      return a.dueDate - b.dueDate;
    }

    if (a.dueDate !== undefined) return -1;
    if (b.dueDate !== undefined) return 1;
    return a.createdAt - b.createdAt;
  })[0];

const daysSince = (timestamp: number, now: number): number =>
  Math.max(0, Math.floor((now - timestamp) / (24 * 60 * 60 * 1000)));

const buildTimeContext = (
  timezone: string | undefined,
  timezoneOffset: number | undefined,
) => {
  const now = Date.now();
  const { dateString, hour } = getTimeContext(now, timezone, timezoneOffset);
  return { now, dateString, hour };
};

const buildAttentionNeededState = async (
  pb: any,
  userId: string,
  tasks: PbTasks[],
  activeHabits: PbHabits[],
  todayDateString: string,
  now: number,
): Promise<ProactiveState | null> => {
  const tier1Overdue = tasks
    .filter(
      (task) =>
        !task.completed &&
        task.dueDate !== undefined &&
        task.dueDate < now,
    )
    .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))[0];

  if (tier1Overdue && tier1Overdue.dueDate !== undefined) {
    return {
      type: "attention_needed",
      priority: "overdue_task",
      taskId: tier1Overdue.id as unknown as PbId<"tasks">,
      taskTitle: tier1Overdue.text,
      overdueByDays: daysSince(tier1Overdue.dueDate, now),
    };
  }

  if (activeHabits.length > 0) {
    const userLogsTodayList = await pb.collection("habit_logs").getList(1, 100, {
      filter: `user = "${userId}" && dateString = "${todayDateString}"`,
    });
    const loggedHabitIds = new Set(
      userLogsTodayList.items.map((log: any) => log.habit),
    );

    const tier2Habit = activeHabits
      .filter((habit) => !loggedHabitIds.has(habit.id))
      .sort((a, b) => {
        if (a.currentStreak !== b.currentStreak) {
          return b.currentStreak - a.currentStreak;
        }
        return a.createdAt - b.createdAt;
      })[0];

    if (tier2Habit) {
      return {
        type: "attention_needed",
        priority: "unchecked_habit",
        habitId: tier2Habit.id as unknown as PbId<"habits">,
        habitName: tier2Habit.name,
        streak: tier2Habit.currentStreak,
      };
    }
  }


  const tier4Oldest = tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.createdAt - b.createdAt)[0];

  if (tier4Oldest) {
    return {
      type: "attention_needed",
      priority: "oldest_task",
      taskId: tier4Oldest.id as unknown as PbId<"tasks">,
      taskTitle: tier4Oldest.text,
      ageInDays: daysSince(tier4Oldest.createdAt, now),
    };
  }

  return null;
};

// --- buildFilter stubs (none of these queries use default args-to-filter mapping) ---
export function buildDashboardFilter(
  args: Record<string, unknown> | undefined,
): string {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    return "1 = 2";
  }
  return `user = "${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// =============================================================================
// Implementation Functions
// =============================================================================

async function getAttentionNeededImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const { now, dateString: todayDateString } = buildTimeContext(
    args?.timezone,
    args?.timezoneOffset,
  );

  const [tasksList, habitsList] = await Promise.all([
    pb.collection("tasks").getList(1, 200, { filter: `user = "${userId}"` }),
    pb.collection("habits").getList(1, 200, { filter: `user = "${userId}"` }),
  ]);

  const activeHabits = (habitsList.items as unknown as PbHabits[]).filter((h) => !h.archived);

  return await buildAttentionNeededState(
    pb,
    userId,
    tasksList.items as unknown as PbTasks[],
    activeHabits,
    todayDateString,
    now,
  );
}


async function getTaskTriageImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const tasksList = await pb.collection("tasks").getList(1, 200, {
    filter: `user = "${userId}"`,
  });

  const now = Date.now();
  const overdue = (tasksList.items as unknown as PbTasks[])
    .filter((t) => !t.completed && t.dueDate !== undefined && t.dueDate < now)
    .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

  if (overdue.length === 0) return null;

  return {
    type: "task_triage",
    count: overdue.length,
    taskIds: overdue.slice(0, 5).map((t) => t.id as unknown as PbId<"tasks">),
  };
}

async function getMorningBriefImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const { dateString: todayDateString, hour } = buildTimeContext(
    args?.timezone,
    args?.timezoneOffset,
  );
  if (hour < 6 || hour >= 12) return null;

  const [tasksList, eventsList] = await Promise.all([
    pb.collection("tasks").getList(1, 200, { filter: `user = "${userId}"` }),
    pb.collection("events").getList(1, 200, { filter: `user = "${userId}"` }),
  ]);

  const todayTasks = (tasksList.items as unknown as PbTasks[]).filter(
    (t) =>
      !t.completed &&
      ((t.dueDateStr && t.dueDateStr === todayDateString) ||
        (t.dueDate !== undefined &&
          formatDateStringForTimestamp(
            t.dueDate,
            args?.timezone,
            args?.timezoneOffset,
          ) === todayDateString)),
  );

  const todayEvents = (eventsList.items as unknown as PbEvents[]).filter((e) =>
    eventOccursOnDate(e, todayDateString, args?.timezone, args?.timezoneOffset),
  );

  const highlightedTask = getHighlightedTask(todayTasks);

  return {
    type: "morning_brief",
    taskCount: todayTasks.length,
    eventCount: todayEvents.length,
    highlightTaskId: highlightedTask?.id as unknown as PbId<"tasks"> | undefined,
    highlightTaskTitle: highlightedTask?.text,
  };
}

async function getEventPrepImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const { now, dateString: todayDateString, hour } = buildTimeContext(
    args?.timezone,
    args?.timezoneOffset,
  );
  if (hour < 12 || hour >= 17) return null;

  const eventsList = await pb.collection("events").getList(1, 200, {
    filter: `user = "${userId}"`,
  });

  const todayEvents = (eventsList.items as unknown as PbEvents[]).filter((e) =>
    eventOccursOnDate(e, todayDateString, args?.timezone, args?.timezoneOffset),
  );

  const upcoming = todayEvents
    .filter((e) => e.startTime > now && e.startTime - now <= 2 * 60 * 60 * 1000)
    .sort((a, b) => a.startTime - b.startTime);

  if (upcoming.length === 0) return null;

  const next = upcoming[0];
  return {
    type: "event_prep",
    eventId: next.id as unknown as PbId<"events">,
    eventTitle: next.title,
    startTime: next.startTime,
    notes: next.notes,
    resourceCount: next.resources?.length ?? 0,
  };
}

async function getHabitCheckImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const { dateString: todayDateString, hour } = buildTimeContext(
    args?.timezone,
    args?.timezoneOffset,
  );
  if (hour < 18 || hour > 22) return null;

  const [habitsList, logsList] = await Promise.all([
    pb.collection("habits").getList(1, 200, { filter: `user = "${userId}"` }),
    pb.collection("habit_logs").getList(1, 200, {
      filter: `user = "${userId}" && dateString = "${todayDateString}"`,
    }),
  ]);

  const activeHabits = (habitsList.items as unknown as PbHabits[]).filter((h) => !h.archived);
  if (activeHabits.length === 0) return null;

  const loggedHabitIds = new Set(logsList.items.map((log: any) => log.habit));

  const pending = activeHabits
    .filter((h) => !loggedHabitIds.has(h.id))
    .sort((a, b) => {
      if (a.currentStreak !== b.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      return a.createdAt - b.createdAt;
    })[0];

  if (!pending) return null;

  return {
    type: "habit_check",
    habitId: pending.id as unknown as PbId<"habits">,
    habitName: pending.name,
    streak: pending.currentStreak,
    dateString: todayDateString,
  };
}

async function getEveningLogImpl(
  args: DashboardTimeArgs,
): Promise<ProactiveState | null> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return null;

  const { dateString: todayDateString, hour } = buildTimeContext(
    args?.timezone,
    args?.timezoneOffset,
  );
  if (hour < 20 || hour > 22) return null;

  const [habitsList, logsList] = await Promise.all([
    pb.collection("habits").getList(1, 200, { filter: `user = "${userId}"` }),
    pb.collection("habit_logs").getList(1, 200, {
      filter: `user = "${userId}" && dateString = "${todayDateString}"`,
    }),
  ]);

  const activeHabits = (habitsList.items as unknown as PbHabits[]).filter((h) => !h.archived);
  if (activeHabits.length === 0) return null;

  const loggedHabitIds = new Set(logsList.items.map((log: any) => log.habit));

  const unlogged = activeHabits
    .filter((h) => !loggedHabitIds.has(h.id))
    .sort((a, b) => {
      if (a.currentStreak !== b.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      return a.createdAt - b.createdAt;
    });

  if (unlogged.length === 0) return null;

  return {
    type: "evening_log",
    unloggedHabitIds: unlogged.map((h) => h.id as unknown as PbId<"habits">),
    unloggedHabitNames: unlogged.map((h) => h.name),
  };
}

async function getMutedCardStatesImpl(
  args: any,
): Promise<PbCardState[]> {
  const pb = getPbClient();
  const userId = args?.userId ?? pb.authStore.record?.id;
  if (!userId) return [];

  const list = await pb.collection("card_state").getList(1, 200, {
    filter: `user = "${userId}"`,
  });
  return list.items as unknown as PbCardState[];
}

// =============================================================================
// Query Declarations
// =============================================================================

export const getAttentionNeededQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "tasks", // Invalidation on tasks / habits
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getAttentionNeededImpl,
);


export const getTaskTriageQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "tasks",
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getTaskTriageImpl,
);

export const getMorningBriefQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "tasks",
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getMorningBriefImpl,
);

export const getEventPrepQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "events",
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getEventPrepImpl,
);

export const getHabitCheckQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "habits",
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getHabitCheckImpl,
);

export const getEveningLogQuery = defineQuery<
  DashboardTimeArgs,
  ProactiveState | null
>(
  {
    collection: "habits",
    kind: "first",
    buildFilter: buildDashboardFilter,
  },
  getEveningLogImpl,
);

export const getMutedCardStatesQuery = defineQuery<
  any,
  PbCardState[]
>(
  {
    collection: "card_state",
    kind: "list",
    buildFilter: buildDashboardFilter,
  },
  getMutedCardStatesImpl,
);
