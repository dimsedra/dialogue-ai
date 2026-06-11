import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPeriodRange, getPeriodLabel, parseDateTime } from "./dateUtils";

describe("dateUtils", () => {
  const OriginalDate = global.Date;
  
  beforeAll(() => {
    // Mock current time to 2024-02-15 12:00:00 UTC (Thursday)
    global.Date = class extends OriginalDate {
      constructor(date?: string | number | Date) {
        if (date !== undefined) {
          super(date);
        } else {
          super("2024-02-15T12:00:00Z");
        }
      }
      static now() {
        return new OriginalDate("2024-02-15T12:00:00Z").getTime();
      }
    } as any;
  });

  afterAll(() => {
    global.Date = OriginalDate;
  });

  describe("getPeriodRange", () => {
    it("handles weekly offset 0 (current week)", () => {
      const { startMs, endMs } = getPeriodRange("weekly", 0, 0);
      const start = new OriginalDate(startMs);
      
      // Start of week: Monday, Feb 12 (local time)
      expect(start.getFullYear()).toBe(2024);
      expect(start.getMonth()).toBe(1); // 0-indexed, 1 = Feb
      expect(start.getDate()).toBe(12);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      
      // End cap is current time since it's in the future
      expect(endMs).toBe(Date.now());
    });

    it("handles weekly offset 1 (last week)", () => {
      const { startMs, endMs } = getPeriodRange("weekly", 1, 0);
      const start = new OriginalDate(startMs);
      const end = new OriginalDate(endMs);
      
      // Start of last week: Monday, Feb 5
      expect(start.getFullYear()).toBe(2024);
      expect(start.getMonth()).toBe(1);
      expect(start.getDate()).toBe(5);

      // End of last week: Sunday, Feb 11
      expect(end.getFullYear()).toBe(2024);
      expect(end.getMonth()).toBe(1);
      expect(end.getDate()).toBe(11);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
    });

    it("handles monthly offset 0 (current month)", () => {
      const { startMs, endMs } = getPeriodRange("monthly", 0, 0);
      const start = new OriginalDate(startMs);
      
      // Start of month: Feb 1
      expect(start.getFullYear()).toBe(2024);
      expect(start.getMonth()).toBe(1);
      expect(start.getDate()).toBe(1);
      
      // End cap is current time
      expect(endMs).toBe(Date.now());
    });
  });

  describe("parseDateTime", () => {
    it("handles ISO-8601 string with Z", () => {
      const parsed = parseDateTime("2026-06-12T13:00:00Z");
      expect(parsed.getTime()).toBe(1781269200000);
    });

    it("handles ISO-8601 string with positive offset", () => {
      const parsed = parseDateTime("2026-06-12T20:00:00+07:00");
      expect(parsed.getTime()).toBe(1781269200000);
    });

    it("handles ISO-8601 string with negative offset", () => {
      const parsed = parseDateTime("2026-06-12T08:00:00-05:00");
      expect(parsed.getTime()).toBe(1781269200000);
    });

    it("parses timezone-naive string in local/specified timezone", () => {
      const parsed = parseDateTime("2026-06-12T20:00:00", "Asia/Jakarta");
      expect(parsed.getTime()).toBe(1781269200000);
    });

    it("falls back to standard parser if no timezone or UTC", () => {
      const parsed = parseDateTime("2026-06-12T13:00:00", "UTC");
      expect(parsed.getTime()).toBe(1781269200000);
    });
  });
});
