import { format, parse, parseISO } from "date-fns";

/**
 * Locale-aware time formatter. Uses the browser's locale and OS preferences
 * to render times in 12-hour (e.g. "3:00 PM") or 24-hour (e.g. "15:00")
 * format automatically, without hardcoding either convention.
 */
export const formatTime = (date: Date | number): string => {
  const d = typeof date === "number" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export const formatRecurrenceText = (rec: { frequency: string; interval: number; daysOfWeek?: number[]; until?: string | number } | undefined) => {
  if (!rec) return "";
  let base = rec.frequency === "daily" 
    ? (rec.interval === 1 ? "Daily" : `Every ${rec.interval} days`)
    : (rec.interval === 1 ? "Weekly" : `Every ${rec.interval} weeks`);
  
  if (rec.frequency === "weekly" && rec.daysOfWeek && rec.daysOfWeek.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const daysStr = [...rec.daysOfWeek].sort().map(d => dayNames[d]).join(", ");
    base = `${base} on ${daysStr}`;
  }
  if (rec.until) {
    const untilDate = typeof rec.until === "number" ? new Date(rec.until) : new Date(rec.until);
    base = `${base}, until ${format(untilDate, "MMM d, yyyy")}`;
  }
  return base;
};

export const parseTaskDate = (dateStr: string | number | undefined): Date | null => {
  if (!dateStr) return null;
  if (typeof dateStr === 'number') return new Date(dateStr);
  try {
    if (dateStr.includes("T") || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      return parseISO(dateStr);
    }
    if (dateStr.includes(" at ")) {
      const datePart = dateStr.split(" at ")[0];
      return parse(datePart, "eeee, MMMM d", new Date());
    }
    if (dateStr.includes("/")) {
      const datePart = dateStr.split(",")[0];
      return parse(datePart, "M/d/yyyy", new Date());
    }
    const cleanDate = dateStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    if (cleanDate) return parse(cleanDate[0], "M/d/yyyy", new Date());
    return null;
  } catch {
    return null;
  }
};

export const formatDateLabel = (date: Date | string | number | undefined) => {
  if (!date) return "";
  const d = typeof date === "string" ? parseTaskDate(date) : new Date(date);
  if (!d) return typeof date === "string" ? date : "";
  
  const yearStr = d.getFullYear() === new Date().getFullYear() ? "" : `, ${d.getFullYear()}`;
  return `${format(d, `MMM d${yearStr}`)}, ${formatTime(d)}`;
};


