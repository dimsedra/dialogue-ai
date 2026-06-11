export function getPeriodRange(
  type: "weekly" | "monthly" | "yearly",
  offset: number,
  timezoneOffset?: number
) {
  const now = new Date();
  if (timezoneOffset !== undefined) {
    now.setTime(now.getTime() - timezoneOffset * 60000);
  }

  const periodStart = new Date(now);
  let periodEnd = new Date(now);

  if (type === "weekly") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    periodStart.setDate(now.getDate() + diffToMonday);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setDate(periodStart.getDate() - 7 * offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "monthly") {
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setMonth(periodStart.getMonth() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodStart.getMonth() + 1);
    periodEnd.setDate(0);
    periodEnd.setHours(23, 59, 59, 999);
  } else if (type === "yearly") {
    periodStart.setMonth(0, 1);
    periodStart.setHours(0, 0, 0, 0);
    
    periodStart.setFullYear(periodStart.getFullYear() - offset);
    
    periodEnd = new Date(periodStart);
    periodEnd.setFullYear(periodStart.getFullYear() + 1);
    periodEnd.setMonth(0, 0);
    periodEnd.setHours(23, 59, 59, 999);
  }

  let startMs = periodStart.getTime();
  let endMs = periodEnd.getTime();

  // Cap endMs to current time for weekly/monthly (avoid future data)
  // For yearly, keep the full Dec 31 end to cover the entire year
  if (type !== "yearly") {
    const currentRealTimeMs = Date.now();
    if (endMs > currentRealTimeMs) {
      endMs = currentRealTimeMs;
    }
  }

  return { startMs, endMs };
}

export function getPeriodLabel(type: "weekly" | "monthly" | "yearly", startMs: number, timezoneOffset?: number) {
  const d = new Date(startMs);
  if (timezoneOffset !== undefined) {
    d.setTime(d.getTime() - timezoneOffset * 60000);
  }
  
  if (type === "weekly") {
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    return `Week of ${month} ${day}, ${year}`;
  } else if (type === "monthly") {
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  } else {
    return `${d.getFullYear()}`;
  }
}

// Helper to expand recurring events for a specific window
export function expandRecurringEventsForWindow(
  events: any[],
  windowStart: number,
  windowEnd: number,
) {
  const expanded: any[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      if (event.startTime >= windowStart && event.startTime <= windowEnd) {
        expanded.push(event);
      }
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
        if (timestamp >= windowStart) {
          expanded.push({
            ...event,
            startTime: timestamp,
            endTime:
              event.endTime !== undefined ? timestamp + duration : undefined,
            cancelled: exceptions.includes(timestamp),
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
                timestamp >= windowStart
              ) {
                expanded.push({
                  ...event,
                  startTime: timestamp,
                  endTime:
                    event.endTime !== undefined
                      ? timestamp + duration
                      : undefined,
                  cancelled: exceptions.includes(timestamp),
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

export function getOffsetMinutes(timezone: string, date?: Date): number {
  const now = date || new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = now.toLocaleString("en-US", { timeZone: timezone });
  const utc = new Date(utcStr);
  const local = new Date(localStr);
  return (utc.getTime() - local.getTime()) / 60000;
}

export function getLocalDateString(timezone: string, date?: Date): string {
  const now = date || new Date();
  return now.toLocaleDateString("en-CA", { timeZone: timezone });
}

export function getTodayBounds(timezone: string, date?: Date): { start: number; end: number } {
  const now = date || new Date();
  const localDateStr = getLocalDateString(timezone, now);
  const [year, month, day] = localDateStr.split("-").map(Number);

  const offset = getOffsetMinutes(timezone, now);
  const localMidnight = new Date(Date.UTC(year, month - 1, day));
  const start = localMidnight.getTime() + offset * 60000;
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

export function parseDateTime(value: string, timezone?: string): Date {
  if (!value) return new Date();
  
  // If the date string already contains timezone info (e.g. 'Z', '+', or '-' after 'T'), parse it directly
  const hasTimezone = value.includes('Z') || value.includes('+') || (value.includes('T') && value.split('T')[1].includes('-'));
  if (hasTimezone) {
    return new Date(value);
  }
  
  // If it's a timezone-naive date-time (e.g. '2026-06-12T18:00:00') and timezone is provided:
  if (timezone) {
    try {
      const dateParts = value.split('T');
      const dateStr = dateParts[0];
      const timeStr = dateParts[1] || '00:00:00';
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hour, minute, second] = timeStr.split(':').map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      
      const parts = formatter.formatToParts(utcDate);
      const partMap: Record<string, number> = {};
      for (const part of parts) {
        if (part.type !== 'literal') {
          partMap[part.type] = Number(part.value);
        }
      }
      
      const formattedUtc = Date.UTC(
        partMap.year,
        partMap.month - 1,
        partMap.day,
        partMap.hour,
        partMap.minute,
        partMap.second || 0
      );
      
      const offsetMs = formattedUtc - utcDate.getTime();
      return new Date(utcDate.getTime() - offsetMs);
    } catch (e) {
      console.warn(`Failed to parse timezone-naive date ${value} with timezone ${timezone}, falling back to default parsing:`, e);
    }
  }
  
  // Fallback
  return new Date(value);
}

