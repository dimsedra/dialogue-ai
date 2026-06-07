import { describe, it, expect } from "vitest";
import {
  buildHabitsListRawFilter,
  buildHabitsGetFilter,
  buildHabitLogsListRecentFilter,
  buildHabitsGetHabitConsistencyFilter,
  habitsListRawQuery,
  habitsGetQuery,
  habitLogsListRecentQuery,
  habitsGetHabitConsistencyQuery,
} from "./habits";

describe("habits: buildHabitsListRawFilter", () => {
  it("filters active habits by user id", () => {
    expect(buildHabitsListRawFilter({ userId: "user123" })).toBe('user = "user123" && archived = false');
  });

  it("filters by user id and workspace id", () => {
    expect(buildHabitsListRawFilter({ userId: "user123", workspaceId: "ws456" })).toBe('user = "user123" && archived = false && workspace = "ws456"');
  });

  it("returns a no-match filter when user is missing", () => {
    expect(buildHabitsListRawFilter(undefined)).toBe("1 = 2");
  });
});

describe("habits: buildHabitsGetFilter", () => {
  it("returns a filter for a specific habit and user", () => {
    expect(buildHabitsGetFilter({ id: "habit123", userId: "user456" })).toBe('id = "habit123" && user = "user456"');
  });
});

describe("habits: buildHabitLogsListRecentFilter", () => {
  it("filters logs by user id", () => {
    expect(buildHabitLogsListRecentFilter({ userId: "user123" })).toBe('user = "user123"');
  });
});

describe("habits: buildHabitsGetHabitConsistencyFilter", () => {
  it("filters logs by user and date range", () => {
    expect(
      buildHabitsGetHabitConsistencyFilter({
        userId: "user123",
        periodStartDate: "2026-05-01",
        periodEndDate: "2026-05-31",
      }),
    ).toBe('user = "user123" && dateString >= "2026-05-01" && dateString <= "2026-05-31"');
  });
});

describe("habits: descriptors shape", () => {
  it("exposes correctly typed descriptors", () => {
    expect(habitsListRawQuery._pb.collection).toBe("habits");
    expect(habitsGetQuery._pb.kind).toBe("first");
    expect(habitLogsListRecentQuery._pb.collection).toBe("habit_logs");
    expect(habitsGetHabitConsistencyQuery._pb.collection).toBe("habit_logs");
  });
});
