import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { eventsListQuery, eventsGetQuery, eventsSearchHistoryQuery } from "../descriptors/events";
import type { PbEvents } from "../_generated/dataModel";

export function mapEvent(pb: PbEvents): PbEvents {
  return pb;
}

export function expandRecurringEvents(
  events: PbEvents[],
  windowStart: number,
  windowEnd: number,
): PbEvents[] {
  const expanded: PbEvents[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      expanded.push(event);
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
        if (timestamp >= windowStart && !exceptions.includes(timestamp)) {
          expanded.push({
            ...event,
            startTime: timestamp,
            endTime:
              event.endTime !== undefined ? timestamp + duration : undefined,
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
                timestamp >= windowStart &&
                !exceptions.includes(timestamp)
              ) {
                expanded.push({
                  ...event,
                  startTime: timestamp,
                  endTime:
                    event.endTime !== undefined
                      ? timestamp + duration
                      : undefined,
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

export function usePbEventsList(args?: { workspaceId?: string }): PbEvents[] | undefined {
  const { user } = useAuth();
  const events = useQuery(
    eventsListQuery,
    user ? { userId: user.id, workspaceId: args?.workspaceId } : undefined,
  );
  if (!events) return undefined;
  
  const mapped = events.map(mapEvent);
  const windowStart = Date.now() - 30 * 24 * 3600 * 1000; // 30 days ago
  const windowEnd = Date.now() + 365 * 24 * 3600 * 1000; // 1 year ahead
  return expandRecurringEvents(mapped, windowStart, windowEnd);
}

export function usePbEvent(id: string | undefined): PbEvents | null | undefined {
  const { user } = useAuth();
  const event = useQuery(
    eventsGetQuery,
    id && user ? { id, userId: user.id } : undefined,
  );
  if (event === undefined) return undefined;
  if (event === null) return null;
  return mapEvent(event);
}

export function usePbEventsSearchHistory(args?: {
  query?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): PbEvents[] | undefined {
  const { user } = useAuth();
  const events = useQuery(
    eventsSearchHistoryQuery,
    user ? {
      userId: user.id,
      query: args?.query,
      startTime: args?.startTime,
      endTime: args?.endTime,
      limit: args?.limit,
    } : undefined,
  );
  if (!events) return undefined;
  return events.map(mapEvent);
}
