import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildWorkspaceDashboardFilter,
  getAttentionNeededQuery,
  getTaskTriageQuery,
  getMorningBriefQuery,
  getEventPrepQuery,
  getHabitCheckQuery,
  getEveningLogQuery,
} from "./dashboard";
import { getPbClient } from "../client";

vi.mock("../client", () => {
  const mockCollectionObj = {
    getList: vi.fn(),
  };
  const mockPbClient = {
    authStore: { record: { id: "user123" } },
    collection: vi.fn().mockReturnValue(mockCollectionObj),
  };
  return {
    getPbClient: vi.fn().mockReturnValue(mockPbClient),
  };
});

describe("dashboard workspace scoping filter builder", () => {
  it("filters by user id only if workspace is not provided", () => {
    expect(buildWorkspaceDashboardFilter({ userId: "user123" })).toBe('user = "user123"');
  });

  it("filters by user id and workspace id if provided", () => {
    expect(buildWorkspaceDashboardFilter({ userId: "user123", workspaceId: "ws456" })).toBe(
      'user = "user123" && workspace = "ws456"'
    );
  });
});

describe("dashboard queries workspace scoping implementations", () => {
  let mockGetList: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const pb = getPbClient();
    mockGetList = pb.collection("any").getList;
    mockGetList.mockResolvedValue({ items: [], totalItems: 0 });
  });

  it("getAttentionNeededQuery queries tasks and habits with workspaceId filter", async () => {
    await getAttentionNeededQuery({ workspaceId: "ws456" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));
  });

  it("getTaskTriageQuery queries tasks with workspaceId filter", async () => {
    await getTaskTriageQuery({ workspaceId: "ws456" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));
  });

  it("getMorningBriefQuery queries tasks and events with workspaceId filter", async () => {
    const originalDateNow = Date.now;
    const fixedTime = new Date("2026-06-21T10:00:00Z").getTime();
    Date.now = () => fixedTime;

    await getMorningBriefQuery({ workspaceId: "ws456", timezone: "UTC" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));

    Date.now = originalDateNow;
  });

  it("getEventPrepQuery queries events with workspaceId filter", async () => {
    const originalDateNow = Date.now;
    const fixedTime = new Date("2026-06-21T14:00:00Z").getTime();
    Date.now = () => fixedTime;

    await getEventPrepQuery({ workspaceId: "ws456", timezone: "UTC" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));

    Date.now = originalDateNow;
  });

  it("getHabitCheckQuery queries habits and habit_logs with workspaceId filter", async () => {
    const originalDateNow = Date.now;
    const fixedTime = new Date("2026-06-21T19:00:00Z").getTime();
    Date.now = () => fixedTime;

    await getHabitCheckQuery({ workspaceId: "ws456", timezone: "UTC" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));

    Date.now = originalDateNow;
  });

  it("getEveningLogQuery queries habits and habit_logs with workspaceId filter", async () => {
    const originalDateNow = Date.now;
    const fixedTime = new Date("2026-06-21T21:00:00Z").getTime();
    Date.now = () => fixedTime;

    await getEveningLogQuery({ workspaceId: "ws456", timezone: "UTC" });
    expect(mockGetList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: expect.stringContaining('user = "user123" && workspace = "ws456"'),
    }));

    Date.now = originalDateNow;
  });
});
