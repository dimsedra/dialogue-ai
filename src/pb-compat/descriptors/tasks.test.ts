import { describe, it, expect } from "vitest";
import {
  buildTasksListFilter,
  buildTasksGetFilter,
  buildTasksSearchHistoryFilter,
  tasksListQuery,
  tasksGetQuery,
  tasksSearchHistoryQuery,
} from "./tasks";

describe("tasks: buildTasksListFilter", () => {
  it("filters by user id", () => {
    expect(buildTasksListFilter({ userId: "user123" })).toBe('user = "user123"');
  });

  it("filters by user id and workspace id", () => {
    expect(buildTasksListFilter({ userId: "user123", workspaceId: "ws456" })).toBe('user = "user123" && workspace = "ws456"');
  });

  it("returns a no-match filter when user is missing", () => {
    expect(buildTasksListFilter(undefined)).toBe("1 = 2");
  });
});

describe("tasks: buildTasksGetFilter", () => {
  it("returns a filter for a specific task and user", () => {
    expect(buildTasksGetFilter({ id: "task123", userId: "user456" })).toBe('id = "task123" && user = "user456"');
  });
});

describe("tasks: buildTasksSearchHistoryFilter", () => {
  it("filters completed tasks by user", () => {
    expect(buildTasksSearchHistoryFilter({ userId: "user123" })).toBe('user = "user123" && completed = true');
  });

  it("includes query search and time boundaries", () => {
    const filter = buildTasksSearchHistoryFilter({
      userId: "user123",
      query: "urgent",
      startTime: 1000,
      endTime: 2000,
    });
    expect(filter).toBe('user = "user123" && completed = true && (completedAt >= 1000 || (completedAt = null && createdAt >= 1000)) && (completedAt <= 2000 || (completedAt = null && createdAt <= 2000)) && text ~ "urgent"');
  });
});

describe("tasks: descriptors shape", () => {
  it("exposes correctly typed descriptors", () => {
    expect(tasksListQuery._pb.collection).toBe("tasks");
    expect(tasksListQuery._pb.kind).toBe("list");
    expect(tasksGetQuery._pb.kind).toBe("first");
    expect(tasksSearchHistoryQuery._pb.kind).toBe("list");
  });
});
