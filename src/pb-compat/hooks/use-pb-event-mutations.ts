import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbEvents } from "../_generated/dataModel";

export function usePbEventCreate() {
  const { user } = useAuth();
  const mutate = useMutation<PbEvents>({ collection: "events", kind: "create" });
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
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      user: user.id as any,
      title: args.title,
      description: args.description || undefined,
      location: args.location || undefined,
      startTime: args.startTime,
      endTime: args.endTime || undefined,
      workspace: (args.workspaceId || undefined) as any,
      eventType: args.eventType,
      recurrence: args.recurrence || undefined,
      reminderOffset: args.reminderOffset || undefined,
      notes: args.notes || undefined,
      outcome: args.outcome || undefined,
      statusHook: args.statusHook || undefined,
      cancelled: false,
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbEventUpdate() {
  const { user } = useAuth();
  const mutate = useMutation<PbEvents>({ collection: "events", kind: "update" });
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
    if (!user) throw new Error("Unauthorized");
    const patch: Record<string, any> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.location !== undefined) patch.location = args.location;
    if (args.startTime !== undefined) patch.startTime = args.startTime;
    if (args.endTime !== undefined) patch.endTime = args.endTime === null ? undefined : args.endTime;
    if (args.workspaceId !== undefined) patch.workspace = args.workspaceId === null ? "" : args.workspaceId;
    if (args.eventType !== undefined) patch.eventType = args.eventType;
    if (args.recurrence !== undefined) patch.recurrence = args.recurrence;
    if (args.reminderOffset !== undefined) patch.reminderOffset = args.reminderOffset === null ? undefined : args.reminderOffset;
    if (args.cancelled !== undefined) patch.cancelled = args.cancelled;
    if (args.notes !== undefined) patch.notes = args.notes === null ? "" : args.notes;
    if (args.outcome !== undefined) patch.outcome = args.outcome === null ? "" : args.outcome;
    if (args.statusHook !== undefined) patch.statusHook = args.statusHook === null ? "" : args.statusHook;

    const record = await mutate({ id: args.eventId, record: patch });
    return record;
  };
}

export function usePbEventDelete() {
  const { user } = useAuth();
  const mutate = useMutation({ collection: "events", kind: "delete" });
  return async (args: { id: string }) => {
    if (!user) throw new Error("Unauthorized");
    await mutate({ id: args.id });
  };
}

export function usePbEventCancelOccurrence() {
  const { user } = useAuth();
  const mutate = useMutation<PbEvents>({ collection: "events", kind: "update" });
  const remove = useMutation({ collection: "events", kind: "delete" });
  return async (args: { id: string; timestamp: number; timezone?: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const event = await pb.collection("events").getOne(args.id);
    if (!event || event.user !== user.id) throw new Error("Unauthorized");

    if (event.series) {
      // It is a detached occurrence, just delete it.
      await remove({ id: args.id });
      return;
    }

    if (event.recurrence) {
      const rec = typeof event.recurrence === "string" ? JSON.parse(event.recurrence) : event.recurrence;
      const exceptions = rec.exceptions ?? [];
      const exceptionsStr = rec.exceptionsStr ?? [];
      const dateStr = new Date(args.timestamp).toLocaleDateString("en-CA", {
        timeZone: args.timezone || "UTC",
      });

      if (!exceptions.includes(args.timestamp)) {
        exceptions.push(args.timestamp);
      }
      if (!exceptionsStr.includes(dateStr)) {
        exceptionsStr.push(dateStr);
      }

      await mutate({
        id: args.id,
        record: {
          recurrence: {
            ...rec,
            exceptions,
            exceptionsStr,
          },
        },
      });
    }
  };
}

export function usePbEventUpdateOccurrence() {
  const { user } = useAuth();
  const mutate = useMutation<PbEvents>({ collection: "events", kind: "update" });
  const create = useMutation<PbEvents>({ collection: "events", kind: "create" });
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
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const parent = await pb.collection("events").getOne(args.seriesId);
    if (!parent || parent.user !== user.id) throw new Error("Unauthorized");

    // 1. Add exception to parent series
    if (parent.recurrence) {
      const rec = typeof parent.recurrence === "string" ? JSON.parse(parent.recurrence) : parent.recurrence;
      const exceptions = rec.exceptions ?? [];
      const exceptionsStr = rec.exceptionsStr ?? [];
      const dateStr = new Date(args.originalStartTime).toLocaleDateString("en-CA", {
        timeZone: args.timezone || "UTC",
      });

      if (!exceptions.includes(args.originalStartTime)) {
        exceptions.push(args.originalStartTime);
      }
      if (!exceptionsStr.includes(dateStr)) {
        exceptionsStr.push(dateStr);
      }

      await mutate({
        id: args.seriesId,
        record: {
          recurrence: {
            ...rec,
            exceptions,
            exceptionsStr,
          },
        },
      });
    }

    // 2. Insert new detached occurrence event
    const duration = parent.endTime !== undefined ? parent.endTime - parent.startTime : 0;
    const finalStartTime = args.startTime ?? args.originalStartTime;
    const finalEndTime = parent.endTime !== undefined ? (args.endTime ?? finalStartTime + duration) : undefined;

    const record = await create({
      user: user.id as any,
      title: args.title ?? parent.title,
      description: args.description ?? parent.description,
      location: args.location ?? parent.location,
      notes: parent.notes || undefined,
      outcome: parent.outcome || undefined,
      statusHook: parent.statusHook || undefined,
      cancelled: args.cancelled || false,
      contextUpdatedAt: parent.contextUpdatedAt || undefined,
      startTime: finalStartTime,
      endTime: finalEndTime,
      eventType: args.eventType ?? parent.eventType,
      series: args.seriesId as any,
      workspace: (parent.workspace || undefined) as any,
      createdAt: Date.now(),
      reminderOffset: parent.reminderOffset || undefined,
    } as any);
    return record.id;
  };
}

export function usePbEventScheduleFocusBlock() {
  const { user } = useAuth();
  const create = useMutation<PbEvents>({ collection: "events", kind: "create" });
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
    const record = await create({
      user: user.id as any,
      title: "Focus Block",
      startTime: focusStart,
      endTime: focusEnd,
      eventType: "interval",
      cancelled: false,
      createdAt: Date.now(),
    } as any);
    return record.id;
  };
}
