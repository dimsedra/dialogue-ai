import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPeriodRange, getPeriodLabel } from "./dateUtils";

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
      const end = new OriginalDate(endMs);
      
      // Start of week: Monday, Feb 12
      expect(start.toISOString().startsWith("2024-02-12")).toBe(true);
      // End cap is current time since it's in the future
      expect(endMs).toBe(Date.now());
    });

    it("handles weekly offset 1 (last week)", () => {
      const { startMs, endMs } = getPeriodRange("weekly", 1, 0);
      const start = new OriginalDate(startMs);
      const end = new OriginalDate(endMs);
      
      // Start of last week: Monday, Feb 5
      expect(start.toISOString().startsWith("2024-02-05")).toBe(true);
      // End of last week: Sunday, Feb 11
      expect(end.toISOString().startsWith("2024-02-11")).toBe(true);
    });

    it("handles monthly offset 0 (current month)", () => {
      const { startMs, endMs } = getPeriodRange("monthly", 0, 0);
      const start = new OriginalDate(startMs);
      
      // Start of month: Feb 1
      expect(start.toISOString().startsWith("2024-02-01")).toBe(true);
      // End cap is current time
      expect(endMs).toBe(Date.now());
    });
  });
});
