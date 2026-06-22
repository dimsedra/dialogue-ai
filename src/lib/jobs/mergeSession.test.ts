import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";

// Mock the dependencies of mergeSession
const mockRunSimpleTask = vi.fn();
const mockGetTaskProviderAndModel = vi.fn();
const mockDecrypt = vi.fn();
const mockUpdateDiskFileForEntity = vi.fn();

vi.mock("../ai-providers", () => ({
  runSimpleTask: mockRunSimpleTask,
  getTaskProviderAndModel: mockGetTaskProviderAndModel,
}));

vi.mock("../encryption", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../folio/sync", () => ({
  updateDiskFileForEntity: mockUpdateDiskFileForEntity,
}));

// Import the function under test
const { mergeSession } = await import("./mergeSession");

function mockCollection(overrides = {}) {
  return {
    getOne: vi.fn(),
    getFirstListItem: vi.fn(),
    getList: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    ...overrides,
  };
}

type MockPb = PocketBase & {
  collection: ReturnType<typeof vi.fn>;
};

function mockPb(collections: Record<string, ReturnType<typeof mockCollection>>): MockPb {
  const pb = { authStore: { save: vi.fn(), token: "mock-token" } } as any;
  pb.collection = vi.fn((name: string) => {
    const c = collections[name];
    if (!c) throw new Error(`Unexpected collection: ${name}`);
    return c;
  });
  return pb;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunSimpleTask.mockResolvedValue("Test Consolidated Summary");
  mockGetTaskProviderAndModel.mockReturnValue({
    provider: "gemini",
    modelId: "gemini-2.5-flash",
  });
  mockDecrypt.mockImplementation((s: string) => Promise.resolve(s));
  mockUpdateDiskFileForEntity.mockResolvedValue(undefined);
});

describe("mergeSession job", () => {
  it("returns failed status if session does not exist", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockRejectedValue({ status: 404 }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await mergeSession(pb, {
      userId: "user1",
      sessionId: "nonexistent",
      folioRootPath: "C:/Users/user/Dialogue Folio",
    });

    expect(result).toEqual({ status: "failed", error: "Session not found" });
  });

  it("returns failed status if user is unauthorized", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({ id: "s1", user: "other-user" }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await mergeSession(pb, {
      userId: "user1",
      sessionId: "s1",
      folioRootPath: "C:/Users/user/Dialogue Folio",
    });

    expect(result).toEqual({ status: "failed", error: "Unauthorized" });
  });

  it("returns failed status if session is not a branch", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({ id: "s1", user: "user1", sessionType: "trunk" }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await mergeSession(pb, {
      userId: "user1",
      sessionId: "s1",
      folioRootPath: "C:/Users/user/Dialogue Folio",
    });

    expect(result).toEqual({ status: "failed", error: "Only topic branches can be merged" });
  });

  it("returns failed status if branch session is already archived", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({ id: "s1", user: "user1", sessionType: "branch", archived: true }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await mergeSession(pb, {
      userId: "user1",
      sessionId: "s1",
      folioRootPath: "C:/Users/user/Dialogue Folio",
    });

    expect(result).toEqual({ status: "failed", error: "Branch is already merged and archived" });
  });

  it("performs a successful merge", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({
        id: "s-branch",
        user: "user1",
        sessionType: "branch",
        title: "Feature Branch",
        parentSession: "s-trunk",
        archived: false,
      }),
      update: vi.fn().mockResolvedValue({}),
    });
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: { provider: "gemini" },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [
          { author: "User", text: "Let's fix this bug" },
          { author: "AI", text: "Sure, let's look at the logs" },
        ],
      }),
      create: vi.fn().mockResolvedValue({}),
    });
    const tasks = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [
          { id: "t1", text: "Fix bug", history_logs: [] }
        ],
      }),
      update: vi.fn().mockResolvedValue({}),
    });
    const events = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [],
      }),
    });

    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
      tasks: tasks,
      events: events,
    });

    const result = await mergeSession(pb, {
      userId: "user1",
      sessionId: "s-branch",
      folioRootPath: "C:/Users/user/Dialogue Folio",
    });

    expect(result).toMatchObject({ status: "merged", summary: "Test Consolidated Summary", parentSessionId: "s-trunk" });

    // Verify LLM prompt compile and invocation
    expect(mockRunSimpleTask).toHaveBeenCalled();

    // Verify system narrated merge commit posted in trunk session
    expect(msgs.create).toHaveBeenCalledWith(expect.objectContaining({
      session: "s-trunk",
      author: "System",
      text: expect.stringContaining("Test Consolidated Summary"),
    }));

    // Verify task updated on disk and database history logs
    expect(mockUpdateDiskFileForEntity).toHaveBeenCalledWith("tasks", "t1", pb, "C:/Users/user/Dialogue Folio", {
      appendNotes: "[Merged Branch: Feature Branch] Test Consolidated Summary",
    });
    expect(tasks.update).toHaveBeenCalledWith("t1", expect.objectContaining({
      history_logs: expect.arrayContaining([
        expect.objectContaining({
          note: "[Merged Branch: Feature Branch] Test Consolidated Summary",
        }),
      ]),
    }));

    // Verify branch session archived and timestamps updated
    expect(sessions.update).toHaveBeenCalledWith("s-branch", expect.objectContaining({
      archived: true,
      lastActivity: expect.any(Number),
    }));
    expect(sessions.update).toHaveBeenCalledWith("s-trunk", expect.objectContaining({
      lastActivity: expect.any(Number),
    }));
  });
});
