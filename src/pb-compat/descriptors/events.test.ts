import { describe, it, expect } from "vitest";
import {
  buildEventsListFilter,
  buildEventsGetFilter,
  buildEventsSearchHistoryFilter,
  eventsListQuery,
  eventsGetQuery,
  eventsSearchHistoryQuery,
} from "./events";

describe("events: buildEventsListFilter", () => {
  it("filters by user id", () => {
    expect(buildEventsListFilter({ userId: "user123" })).toBe('user = "user123"');
  });

  it("filters by user id and workspace id", () => {
    expect(buildEventsListFilter({ userId: "user123", workspaceId: "ws456" })).toBe('user = "user123" && workspace = "ws456"');
  });

  it("returns a no-match filter when user is missing", () => {
    expect(buildEventsListFilter(undefined)).toBe("1 = 2");
  });
});

describe("events: buildEventsGetFilter", () => {
  it("returns a filter for a specific event and user", () => {
    expect(buildEventsGetFilter({ id: "event123", userId: "user456" })).toBe('id = "event123" && user = "user456"');
  });
});

describe("events: buildEventsSearchHistoryFilter", () => {
  it("filters past events by user", () => {
    const filter = buildEventsSearchHistoryFilter({ userId: "user123" });
    expect(filter).toContain('user = "user123" && startTime <');
  });

  it("includes query search and time boundaries", () => {
    const filter = buildEventsSearchHistoryFilter({
      userId: "user123",
      query: "meeting",
      startTime: 1000,
      endTime: 2000,
    });
    expect(filter).toContain('user = "user123" && startTime <');
    expect(filter).toContain('&& startTime >= 1000 && startTime <= 2000 && (title ~ "meeting" || description ~ "meeting")');
  });
});

describe("events: descriptors shape", () => {
  it("exposes correctly typed descriptors", () => {
    expect(eventsListQuery._pb.collection).toBe("events");
    expect(eventsListQuery._pb.kind).toBe("list");
    expect(eventsGetQuery._pb.kind).toBe("first");
    expect(eventsSearchHistoryQuery._pb.kind).toBe("list");
  });
});
