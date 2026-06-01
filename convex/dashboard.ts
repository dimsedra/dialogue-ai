import { query, internalQuery, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";

type ProactiveState =
  | {
      type: "reflection_ready";
      reflectionId: Id<"reflections">;
      periodLabel: string;
    }
  | {
      type: "task_triage";
      count: number;
      taskIds: Id<"tasks">[];
    }
  | {
      type: "habit_check";
      habitId: Id<"habits">;
      habitName: string;
      streak: number;
      dateString: string;
    }
  | {
      type: "morning_brief";
      taskCount: number;
      eventCount: number;
      highlightTaskId?: Id<"tasks">;
      highlightTaskTitle?: string;
    }
  | {
      type: "standard_snapshot";
      taskCount: number;
      eventCount: number;
    };

type TimeContext = {
  dateString: string;
  hour: number;
};

type CardId = string;

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
): TimeContext => {
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
): TimeContext => {
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
): TimeContext => {
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
  event: Doc<"events">,
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

const getHighlightedTask = (tasks: Doc<"tasks">[]) =>
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
    return a._creationTime - b._creationTime;
  })[0];

type CardType = ProactiveState["type"];

const DEBOUNCE_MS: Record<CardType, number> = {
  reflection_ready: 4 * 60 * 60 * 1000,
  task_triage: 4 * 60 * 60 * 1000,
  habit_check: 60 * 60 * 1000,
  morning_brief: 4 * 60 * 60 * 1000,
  standard_snapshot: 0,
};

const TIME_BUCKETED_CARDS: ReadonlySet<CardType> = new Set([
  "habit_check",
  "morning_brief",
]);

const getEndOfDayMs = (
  todayDateString: string,
  timezone?: string,
  timezoneOffset?: number,
): number => {
  const { year, month, day } = parseDateString(todayDateString);
  const nextDateString = buildDateString(year, month + 1, day + 1);
  const nextDayMidnight = new Date(`${nextDateString}T00:00:00Z`).getTime();
  if (timezone || timezoneOffset !== undefined) {
    return getTimeContext(nextDayMidnight, timezone, timezoneOffset)
      .dateString === nextDateString
      ? nextDayMidnight
      : nextDayMidnight - 1;
  }
  return nextDayMidnight;
};

const isSuppressed = (
  state: Doc<"cardState"> | null,
  cardType: CardType,
  now: number,
  todayDateString: string,
  timezone?: string,
  timezoneOffset?: number,
): boolean => {
  if (!state) return false;

  if (state.mutedAt !== undefined) return true;

  if (state.snoozedUntil !== undefined && state.snoozedUntil > now) {
    return true;
  }

  if (state.dismissedAt !== undefined) {
    if (TIME_BUCKETED_CARDS.has(cardType)) {
      return state.dismissedAt >=
        getEndOfDayMs(todayDateString, timezone, timezoneOffset) - 24 * 60 * 60 * 1000;
    }
    return true;
  }

  const debounce = DEBOUNCE_MS[cardType];
  if (
    debounce > 0 &&
    state.lastShownAt !== undefined &&
    now - state.lastShownAt < debounce
  ) {
    return true;
  }

  return false;
};

const cardIdFor = (state: ProactiveState): CardId | undefined => {
  switch (state.type) {
    case "reflection_ready":
      return state.reflectionId;
    case "habit_check":
      return state.habitId;
    case "task_triage":
    case "morning_brief":
    case "standard_snapshot":
      return undefined;
  }
};

const collectCardStates = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  candidates: ProactiveState[],
) => {
  const typeCardIdPairs = new Set<string>();
  for (const c of candidates) {
    const cid = cardIdFor(c);
    typeCardIdPairs.add(`${c.type}|${cid ?? ""}`);
  }

  const results = await ctx.db
    .query("cardState")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const map = new Map<string, Doc<"cardState">>();
  for (const row of results) {
    map.set(`${row.cardType}|${row.cardId ?? ""}`, row);
  }
  return map;
};

export const getProactiveState = query({
  args: {
    timezone: v.optional(v.string()),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProactiveState> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return {
        type: "standard_snapshot",
        taskCount: 0,
        eventCount: 0,
      };
    }

    const now = Date.now();
    const { dateString: todayDateString, hour: localHour } = getTimeContext(
      now,
      args.timezone,
      args.timezoneOffset,
    );

    const [tasks, events, habits] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("events").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("habits").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

    const reflectionCandidates = await Promise.all(
      (["weekly", "monthly", "yearly"] as const).map((type) =>
        ctx.db
          .query("reflections")
          .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", type))
          .order("desc")
          .first(),
      ),
    );

    const pendingReflection = reflectionCandidates
      .filter((reflection): reflection is Doc<"reflections"> => Boolean(reflection))
      .filter((reflection) => reflection.userReflection === undefined)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    const reflectionState: ProactiveState | null = pendingReflection
      ? {
          type: "reflection_ready",
          reflectionId: pendingReflection._id,
          periodLabel: pendingReflection.periodLabel,
        }
      : null;

    const overdueTasks = tasks.filter(
      (task) => !task.completed && task.dueDate !== undefined && task.dueDate < now,
    );

    const taskTriageState: ProactiveState | null =
      overdueTasks.length > 0
        ? {
            type: "task_triage",
            count: overdueTasks.length,
            taskIds: overdueTasks.slice(0, 5).map((t) => t._id),
          }
        : null;

    const activeHabits = habits.filter((habit) => !habit.archived);

    let habitCheckState: ProactiveState | null = null;
    if (localHour >= 18 && localHour <= 22 && activeHabits.length > 0) {
      const userLogsToday = await ctx.db
        .query("habitLogs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const loggedHabitIds = new Set(
        userLogsToday
          .filter((log) => log.dateString === todayDateString)
          .map((log) => log.habitId),
      );

      const pendingHabit = activeHabits
        .filter((habit) => !loggedHabitIds.has(habit._id))
        .sort((a, b) => {
          if (a.currentStreak !== b.currentStreak) {
            return b.currentStreak - a.currentStreak;
          }
          return a.createdAt - b.createdAt;
        })[0];

      if (pendingHabit) {
        habitCheckState = {
          type: "habit_check",
          habitId: pendingHabit._id,
          habitName: pendingHabit.name,
          streak: pendingHabit.currentStreak,
          dateString: todayDateString,
        };
      }
    }

    const todayTasks = tasks.filter(
      (task) =>
        !task.completed &&
        ((task.dueDateStr && task.dueDateStr === todayDateString) ||
          (task.dueDate !== undefined &&
            formatDateStringForTimestamp(
              task.dueDate,
              args.timezone,
              args.timezoneOffset,
            ) === todayDateString)),
    );

    const todayEvents = events.filter((event) =>
      eventOccursOnDate(
        event,
        todayDateString,
        args.timezone,
        args.timezoneOffset,
      ),
    );

    const morningBriefState: ProactiveState | null =
      localHour >= 6 && localHour < 12
        ? (() => {
            const highlightedTask = getHighlightedTask(todayTasks);
            return {
              type: "morning_brief",
              taskCount: todayTasks.length,
              eventCount: todayEvents.length,
              highlightTaskId: highlightedTask?._id,
              highlightTaskTitle: highlightedTask?.text,
            } satisfies ProactiveState;
          })()
        : null;

    const standardSnapshot: ProactiveState = {
      type: "standard_snapshot",
      taskCount: todayTasks.length,
      eventCount: todayEvents.length,
    };

    const candidateOrder: ProactiveState[] = [
      ...(reflectionState ? [reflectionState] : []),
      ...(taskTriageState ? [taskTriageState] : []),
      ...(habitCheckState ? [habitCheckState] : []),
      ...(morningBriefState ? [morningBriefState] : []),
    ];

    const cardStateMap = await collectCardStates(ctx, userId, candidateOrder);

    for (const candidate of candidateOrder) {
      const cid = cardIdFor(candidate);
      const stateRow = cardStateMap.get(`${candidate.type}|${cid ?? ""}`);
      const suppressed = isSuppressed(
        stateRow ?? null,
        candidate.type,
        now,
        todayDateString,
        args.timezone,
        args.timezoneOffset,
      );
      if (!suppressed) {
        return candidate;
      }
    }

    return standardSnapshot;
  },
});

export const getLastSession = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
  },
});

type CardStateRow = {
  _id: Id<"cardState">;
  _creationTime: number;
  userId: Id<"users">;
  cardType: string;
  cardId?: string;
  dismissedAt?: number;
  snoozedUntil?: number;
  mutedAt?: number;
  lastShownAt?: number;
};

const findExistingCardState = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  cardType: string,
  cardId: string | undefined,
): Promise<CardStateRow | null> => {
  if (cardId !== undefined) {
    const exact = await ctx.db
      .query("cardState")
      .withIndex("by_user_type_cardid", (q) =>
        q.eq("userId", userId).eq("cardType", cardType).eq("cardId", cardId),
      )
      .unique();
    if (exact) return exact as CardStateRow;
  }
  const allForType = await ctx.db
    .query("cardState")
    .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("cardType", cardType))
    .collect();
  return (allForType.find((row: CardStateRow) => row.cardId === cardId) ?? null) as
    | CardStateRow
    | null;
};

export const dismissCard = mutation({
  args: {
    cardType: v.string(),
    cardId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await findExistingCardState(ctx, userId, args.cardType, args.cardId);
    if (existing) {
      await ctx.db.patch("cardState", existing._id, {
        dismissedAt: Date.now(),
        snoozedUntil: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("cardState", {
      userId,
      cardType: args.cardType,
      cardId: args.cardId,
      dismissedAt: Date.now(),
    });
  },
});

export const snoozeCard = mutation({
  args: {
    cardType: v.string(),
    cardId: v.optional(v.string()),
    duration: v.union(
      v.literal("1h"),
      v.literal("today"),
      v.literal("tomorrow"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();
    let snoozedUntil: number;
    if (args.duration === "1h") {
      snoozedUntil = now + 60 * 60 * 1000;
    } else if (args.duration === "today") {
      const endOfDay = new Date();
      endOfDay.setHours(22, 0, 0, 0);
      snoozedUntil = endOfDay.getTime();
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      snoozedUntil = tomorrow.getTime();
    }

    const existing = await findExistingCardState(ctx, userId, args.cardType, args.cardId);
    if (existing) {
      await ctx.db.patch("cardState", existing._id, {
        snoozedUntil,
        dismissedAt: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("cardState", {
      userId,
      cardType: args.cardType,
      cardId: args.cardId,
      snoozedUntil,
    });
  },
});

export const muteCardType = mutation({
  args: {
    cardType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await findExistingCardState(ctx, userId, args.cardType, undefined);
    if (existing) {
      await ctx.db.patch("cardState", existing._id, {
        mutedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("cardState", {
      userId,
      cardType: args.cardType,
      mutedAt: Date.now(),
    });
  },
});

export const unmuteCardType = mutation({
  args: {
    cardType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const all = await ctx.db
      .query("cardState")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", userId).eq("cardType", args.cardType),
      )
      .collect();

    for (const row of all) {
      await ctx.db.patch("cardState", row._id, { mutedAt: undefined });
    }
    return all.length;
  },
});

export const markCardShown = mutation({
  args: {
    cardType: v.string(),
    cardId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const existing = await findExistingCardState(ctx, userId, args.cardType, args.cardId);
    if (existing) {
      await ctx.db.patch("cardState", existing._id, { lastShownAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("cardState", {
      userId,
      cardType: args.cardType,
      cardId: args.cardId,
      lastShownAt: Date.now(),
    });
  },
});

export const getMutedCardTypes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("cardState")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const seenTypes = new Set<string>();
    const muted: string[] = [];
    for (const row of rows) {
      if (row.mutedAt !== undefined && !seenTypes.has(row.cardType)) {
        seenTypes.add(row.cardType);
        muted.push(row.cardType);
      }
    }
    return muted;
  },
});
