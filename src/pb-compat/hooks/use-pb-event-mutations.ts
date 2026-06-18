import { useAction, defineAction } from "../use-action";
import { useAuth } from "../auth";
import { getPbClient } from "../client";

export function usePbEventCreate() {
  const runCreate = useAction<
    {
      title: string;
      description?: string;
      location?: string;
      startTime: number;
      endTime?: number;
      eventType: "interval" | "point";
      recurrence?: any;
      reminderOffset?: number;
      notes?: string;
      outcome?: string;
      statusHook?: string;
      workspaceId?: string;
    },
    { id: string }
  >(defineAction("createEvent"));

  return async (args: {
    title: string;
    description?: string;
    location?: string;
    startTime: number;
    endTime?: number;
    workspaceId?: string;
    eventType: "interval" | "point";
    recurrence?: any;
    reminderOffset?: number;
    notes?: string;
    outcome?: string;
    statusHook?: string;
  }) => {
    const res = await runCreate({
      title: args.title,
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      eventType: args.eventType,
      recurrence: args.recurrence,
      reminderOffset: args.reminderOffset,
      notes: args.notes,
      outcome: args.outcome,
      statusHook: args.statusHook,
      workspaceId: args.workspaceId,
    });
    return res.id;
  };
}

export function usePbEventUpdate() {
  const runUpdate = useAction<
    {
      eventId: string;
      title?: string;
      description?: string;
      location?: string;
      startTime?: number;
      endTime?: number;
      workspaceId?: string | null;
      eventType?: "interval" | "point";
      recurrence?: any;
      reminderOffset?: number | null;
      cancelled?: boolean;
      notes?: string | null;
      outcome?: string | null;
      statusHook?: string | null;
    },
    { success: boolean }
  >(defineAction("updateEvent"));

  return async (args: {
    eventId: string;
    title?: string;
    description?: string;
    location?: string;
    startTime?: number;
    endTime?: number;
    workspaceId?: string | null;
    eventType?: "interval" | "point";
    recurrence?: any;
    reminderOffset?: number | null;
    cancelled?: boolean;
    notes?: string | null;
    outcome?: string | null;
    statusHook?: string | null;
  }) => {
    await runUpdate(args);
    return { id: args.eventId };
  };
}

export function usePbEventDelete() {
  const runDelete = useAction<{ eventId: string }, { success: boolean }>(
    defineAction("deleteEvent")
  );

  return async (args: { id: string }) => {
    await runDelete({ eventId: args.id });
  };
}

export function usePbEventCancelOccurrence() {
  const runCancelOccurrence = useAction<
    { seriesId: string; originalStartTime: number; timezone?: string },
    { success: boolean }
  >(defineAction("cancelEventOccurrence"));

  const runDelete = useAction<{ eventId: string }, { success: boolean }>(
    defineAction("deleteEvent")
  );

  const { user } = useAuth();

  return async (args: { id: string; timestamp: number; timezone?: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const event = await pb.collection("events").getOne(args.id);
    if (!event || event.user !== user.id) throw new Error("Unauthorized");

    if (event.series) {
      // It is a detached occurrence, just delete it.
      await runDelete({ eventId: args.id });
      return;
    }

    if (event.recurrence) {
      await runCancelOccurrence({
        seriesId: args.id,
        originalStartTime: args.timestamp,
        timezone: args.timezone,
      });
    }
  };
}

export function usePbEventUpdateOccurrence() {
  const runUpdateOccurrence = useAction<
    {
      seriesId: string;
      originalStartTime: number;
      title?: string;
      description?: string;
      location?: string;
      startTime?: number;
      endTime?: number;
      eventType?: "interval" | "point";
      cancelled?: boolean;
      timezone?: string;
    },
    { detachedEventId: string }
  >(defineAction("updateEventOccurrence"));

  return async (args: {
    seriesId: string;
    originalStartTime: number;
    title?: string;
    description?: string;
    location?: string;
    startTime?: number;
    endTime?: number;
    eventType?: "interval" | "point";
    cancelled?: boolean;
    timezone?: string;
  }) => {
    const res = await runUpdateOccurrence(args);
    return res.detachedEventId;
  };
}

export function usePbEventScheduleFocusBlock() {
  const { user } = useAuth();
  const runCreate = useAction<
    {
      title: string;
      startTime: number;
      endTime: number;
      eventType: "interval" | "point";
    },
    { id: string }
  >(defineAction("createEvent"));

  return async (args: { timezone?: string; timezoneOffset?: number }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const now = Date.now();
    const offset = args.timezoneOffset ?? 0;

    const localNow = new Date(now - offset * 60000);
    const todayStart = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0, 0) + offset * 60000;
    const todayEnd = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 22, 0, 0, 0) + offset * 60000;

    const list = await pb.collection("events").getList(1, 500, {
      filter: `user = "${user.id}" && cancelled = false && startTime < ${todayEnd} && (endTime = null || endTime > ${todayStart})`,
    });

    const todayEvents = list.items
      .map((e) => ({
        start: Math.max(e.startTime, todayStart),
        end: Math.min(e.endTime || e.startTime + 3600000, todayEnd),
      }))
      .sort((a, b) => a.start - b.start);

    const FOCUS_DURATION = 90 * 60 * 1000;
    let focusStart = now > todayStart ? Math.max(now, todayStart) : todayStart;
    focusStart = Math.ceil(focusStart / 3600000) * 3600000;

    for (const event of todayEvents) {
      if (event.start - focusStart >= FOCUS_DURATION) {
        break;
      }
      focusStart = Math.max(focusStart, event.end);
      focusStart = Math.ceil(focusStart / 3600000) * 3600000;
    }

    const focusEnd = focusStart + FOCUS_DURATION;
    const res = await runCreate({
      title: "Focus Block",
      startTime: focusStart,
      endTime: focusEnd,
      eventType: "interval",
    });
    return res.id;
  };
}
