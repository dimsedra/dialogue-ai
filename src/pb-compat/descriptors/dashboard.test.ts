import { describe, it, expect } from "vitest";
import {
  buildDashboardFilter,
  getAttentionNeededQuery,
  getTaskTriageQuery,
  getMorningBriefQuery,
  getEventPrepQuery,
  getHabitCheckQuery,
  getEveningLogQuery,
  getMutedCardStatesQuery,
} from "./dashboard";

describe("dashboard: buildDashboardFilter", () => {
  it("filters by user id", () => {
    expect(buildDashboardFilter({ userId: "user123" })).toBe('user = "user123"');
  });

  it("returns a no-match filter when user is missing", () => {
    expect(buildDashboardFilter(undefined)).toBe("1 = 2");
  });
});

describe("dashboard: descriptors shape", () => {
  it("exposes correctly typed descriptors", () => {
    expect(getAttentionNeededQuery._pb.collection).toBe("tasks");
    expect(getAttentionNeededQuery._pb.kind).toBe("first");
    

    expect(getTaskTriageQuery._pb.collection).toBe("tasks");
    expect(getTaskTriageQuery._pb.kind).toBe("first");
    
    expect(getMorningBriefQuery._pb.collection).toBe("tasks");
    expect(getMorningBriefQuery._pb.kind).toBe("first");
    
    expect(getEventPrepQuery._pb.collection).toBe("events");
    expect(getEventPrepQuery._pb.kind).toBe("first");
    
    expect(getHabitCheckQuery._pb.collection).toBe("habits");
    expect(getHabitCheckQuery._pb.kind).toBe("first");
    
    expect(getEveningLogQuery._pb.collection).toBe("habits");
    expect(getEveningLogQuery._pb.kind).toBe("first");
    
    expect(getMutedCardStatesQuery._pb.collection).toBe("card_state");
    expect(getMutedCardStatesQuery._pb.kind).toBe("list");
  });
});
