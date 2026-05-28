/**
 * Timezone utilities using IANA timezone strings.
 * All functions derive offsets dynamically — no static snapshots.
 */

/**
 * Derive UTC offset in minutes from an IANA timezone string.
 * Handles DST automatically.
 */
export function getOffsetMinutes(timezone: string, date?: Date): number {
  const now = date || new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = now.toLocaleString("en-US", { timeZone: timezone });
  const utc = new Date(utcStr);
  const local = new Date(localStr);
  return (utc.getTime() - local.getTime()) / 60000;
}

/**
 * Get local date string "YYYY-MM-DD" from an IANA timezone.
 */
export function getLocalDateString(timezone: string, date?: Date): string {
  const now = date || new Date();
  return now.toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Get local hour (0-23) from an IANA timezone.
 */
export function getLocalHour(timezone: string, date?: Date): number {
  const now = date || new Date();
  const hourStr = now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(hourStr, 10);
}

/**
 * Get local day of week (0=Sun, 1=Mon, ..., 6=Sat) from an IANA timezone.
 */
export function getLocalDayOfWeek(timezone: string, date?: Date): number {
  const now = date || new Date();
  const dayStr = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[dayStr] ?? 0;
}

/**
 * Get the most recent Monday in the user's local time.
 * Returns epoch ms of Monday 00:00 in the user's timezone, converted to UTC.
 */
export function getLocalMonday(timezone: string, date?: Date): Date {
  const now = date || new Date();
  const localDay = getLocalDayOfWeek(timezone, now);
  const daysSinceMonday = (localDay + 6) % 7; // Mon=0, Sun=6

  // Get local date components
  const localDateStr = getLocalDateString(timezone, now);
  const [year, month, day] = localDateStr.split("-").map(Number);

  // Calculate Monday's date
  const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  return monday;
}

/**
 * Get the start and end of "today" in the user's local timezone,
 * returned as UTC epoch ms.
 */
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

/**
 * Format a Unix timestamp to local time string using IANA timezone.
 */
export function formatLocalTime(timezone: string, timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: timezone,
    hour12: false,
  });
}

/**
 * Convert epoch ms to YYYY-MM-DD string in a given IANA timezone.
 */
export function epochMsToDateStr(epochMs: number, timezone: string): string {
  return new Date(epochMs).toLocaleDateString("en-CA", { timeZone: timezone });
}
