import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";
import { join } from "path";

// ---------------------------------------------------------------------------
// Hoisted mocks for dynamic imports
// ---------------------------------------------------------------------------
const mockRunSimpleTask = vi.fn();
const mockGetTaskProviderAndModel = vi.fn();
const mockDecrypt = vi.fn();
const mockGenerateDailySummary = vi.fn();
const mockGetLocalEmbedding = vi.fn();
const mockWireMentionsEdges = vi.fn();
const mockSyncFolioFileToDb = vi.fn();
const mockGetFolioContext = vi.fn();

vi.mock("../ai-providers", () => ({
  runSimpleTask: mockRunSimpleTask,
  getTaskProviderAndModel: mockGetTaskProviderAndModel,
}));

vi.mock("../encryption", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("./generateDailySummary", () => ({
  generateDailySummary: mockGenerateDailySummary,
}));

vi.mock("../graph/embedding", () => ({
  getLocalEmbedding: mockGetLocalEmbedding,
}));

vi.mock("../graph/edges", () => ({
  wireMentionsEdges: mockWireMentionsEdges,
}));

const mockFolioRequestContext = {
  run: vi.fn().mockImplementation(async (store: any, fn: any) => {
    return await fn();
  }),
  getStore: vi.fn().mockReturnValue({ activeWorkspace: "" }),
};

vi.mock("../folio/sync", () => ({
  syncFolioFileToDb: mockSyncFolioFileToDb,
  folioRequestContext: mockFolioRequestContext,
  getFolioContext: mockGetFolioContext,
}));

// Mock filesystem
const mockFiles: Record<string, string> = {};

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const mocked = {
    ...actual,
    existsSync: (p: any) => {
      const norm = String(p).replace(/\\/g, "/");
      if (norm.includes("dialogue-folio")) {
        return !!mockFiles[norm];
      }
      return actual.existsSync(p);
    },
    readFileSync: (p: any, options?: any) => {
      const norm = String(p).replace(/\\/g, "/");
      if (norm.includes("dialogue-folio")) {
        if (!mockFiles[norm]) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
        return mockFiles[norm];
      }
      return actual.readFileSync(p, options);
    },
    writeFileSync: (p: any, data: any, options?: any) => {
      const norm = String(p).replace(/\\/g, "/");
      if (norm.includes("dialogue-folio")) {
        mockFiles[norm] = String(data);
        return;
      }
      actual.writeFileSync(p, data, options);
    },
    mkdirSync: () => undefined,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

// Import the observer function under test
const { runObserver } = await import("./observer");

function mockCollection(items: any[] = []) {
  return {
    getOne: vi.fn().mockImplementation(async (id: string) => {
      const found = items.find((i) => i.id === id);
      if (!found) throw { status: 404 };
      return found;
    }),
    getFirstListItem: vi.fn().mockImplementation(async (filter: string) => {
      const found = items[0];
      if (!found) throw { status: 404 };
      return found;
    }),
    getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
    getFullList: vi.fn().mockResolvedValue(items),
    update: vi.fn().mockImplementation(async (id: string, record: any) => {
      const found = items.find((i) => i.id === id);
      if (found) Object.assign(found, record);
      return { id, ...record };
    }),
    create: vi.fn().mockImplementation(async (record: any) => {
      const item = { id: `id-${Math.random()}`, ...record };
      items.push(item);
      return item;
    }),
  };
}

function mockPb(collections: Record<string, any>) {
  const pb = { authStore: { save: vi.fn(), token: "mock-token", record: { id: "user-1", collectionName: "users" } } } as any;
  pb.collection = vi.fn((name: string) => {
    return collections[name] || mockCollection([]);
  });
  return pb;
}

describe("runObserver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTaskProviderAndModel.mockReturnValue({ provider: "gemini", modelId: "gemini-2.5-flash" });
    mockDecrypt.mockImplementation((s: string) => Promise.resolve(s));
    mockGenerateDailySummary.mockResolvedValue({ status: "created" });
    mockGetLocalEmbedding.mockResolvedValue(new Array(384).fill(0.1));
    mockGetFolioContext.mockReturnValue({ folioRootPath: join(process.cwd(), "dialogue-folio") });
    mockRunSimpleTask.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes("weekly digest")) {
        return JSON.stringify({
          updatedBio: "Alice has been writing code and exploring Rust.",
          weeklyDigest: "Explored Rust and established project setup."
        });
      }
      if (prompt.includes("CONTEXT.md")) {
        return "# Workspace Context\n\n## Goals\n- Build high performance Rust code.\n\n## Milestones\n- Completed writing Vitest tests.";
      }
      // Fallback for memory extraction
      return JSON.stringify(["User prefers TypeScript over Python."]);
    });
    // Clear virtual files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
  });

  it("should run daily log stage and complete successfully even with no session ID", async () => {
    const pb = mockPb({});
    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
    });

    expect(result.dailySummaryStatus).toBe("created");
    expect(result.memoriesExtracted).toBe(0);
    expect(mockGenerateDailySummary).toHaveBeenCalledWith(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
    });
  });

  it("should run memory extraction stage when session ID is provided", async () => {
    const messages = [
      { id: "msg-1", session: "sess-123", author: "user", text: "I prefer typescript over python." },
      { id: "msg-2", session: "sess-123", author: "companion", text: "Noted! Typescript is great." },
    ];
    const sessions = [
      { id: "sess-123", workspace: "ws-1" },
    ];
    const workspaces = [
      { id: "ws-1", name: "Coding Project" },
    ];
    const userProfiles = [
      { id: "prof-1", user: "user-1", preferences: {} },
    ];

    const pb = mockPb({
      messages: mockCollection(messages),
      chat_sessions: mockCollection(sessions),
      workspaces: mockCollection(workspaces),
      user_profile: mockCollection(userProfiles),
      memories: mockCollection([]),
    });

    mockRunSimpleTask.mockResolvedValue(JSON.stringify(["User prefers TypeScript over Python."]));

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-123",
    });

    expect(result.dailySummaryStatus).toBe("created");
    expect(result.memoriesExtracted).toBe(1);

    // Verify it resolved the workspace path and wrote to its MEMORIES.md
    const expectedPath = join(process.cwd(), "dialogue-folio", "workspaces", "coding-project-ws-1", "MEMORIES.md").replace(/\\/g, "/");
    expect(mockFiles[expectedPath]).toContain("User prefers TypeScript over Python.");

    expect(mockSyncFolioFileToDb).toHaveBeenCalled();
    expect(mockWireMentionsEdges).toHaveBeenCalled();
  });

  it("should write to system/MEMORIES.md when session has no active workspace", async () => {
    const messages = [
      { id: "msg-1", session: "sess-456", author: "user", text: "My favorite color is green." },
    ];
    const sessions = [
      { id: "sess-456", workspace: "" },
    ];
    const userProfiles = [
      { id: "prof-1", user: "user-1", preferences: {} },
    ];

    const pb = mockPb({
      messages: mockCollection(messages),
      chat_sessions: mockCollection(sessions),
      user_profile: mockCollection(userProfiles),
      memories: mockCollection([]),
    });

    mockRunSimpleTask.mockResolvedValue(JSON.stringify(["User's favorite color is green."]));

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-456",
    });

    expect(result.memoriesExtracted).toBe(1);

    const expectedPath = join(process.cwd(), "dialogue-folio", "system", "MEMORIES.md").replace(/\\/g, "/");
    expect(mockFiles[expectedPath]).toContain("User's favorite color is green.");
  });

  it("should skip saving duplicate memory if semantic similarity is high", async () => {
    const messages = [
      { id: "msg-1", session: "sess-456", author: "user", text: "I love pizza." },
    ];
    const sessions = [
      { id: "sess-456", workspace: "" },
    ];
    const userProfiles = [
      { id: "prof-1", user: "user-1", preferences: {} },
    ];
    const existingMem = [
      { id: "mem-old", user: "user-1", text: "User loves pizza.", embedding: new Array(384).fill(0.1), source_type: "File", source_id: "system/MEMORIES.md" },
    ];

    const pb = mockPb({
      messages: mockCollection(messages),
      chat_sessions: mockCollection(sessions),
      user_profile: mockCollection(userProfiles),
      memories: mockCollection(existingMem),
    });

    mockRunSimpleTask.mockResolvedValue(JSON.stringify(["User loves pizza."]));
    // Set mock embedding same as existing to get high similarity (dot product will be high)
    mockGetLocalEmbedding.mockResolvedValue(new Array(384).fill(0.1));

    // Pre-populate system memories file with existing text
    const systemMemPath = join(process.cwd(), "dialogue-folio", "system", "MEMORIES.md").replace(/\\/g, "/");
    mockFiles[systemMemPath] = "- User loves pizza.\n";

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-456",
    });

    // It should update duplicate memory inline, which results in 1 memory extracted (written/updated)
    expect(result.memoriesExtracted).toBe(1);
    expect(mockFiles[systemMemPath]).toContain("User loves pizza.");
  });

  it("should trigger weekly USER.md profiling when 7 days have passed and save biography", async () => {
    const userProfiles = [
      {
        id: "prof-1",
        user: "user-1",
        name: "Alice",
        weeklyNotesSummaries: ["Old digest"],
        preferences: {
          lastUserMdSynthesis: Date.now() - 8 * 24 * 60 * 60 * 1000
        }
      }
    ];

    const sessionSummaries = [
      { id: "sum-1", user: "user-1", date: "2026-06-19", summary: "Finished project setup." },
      { id: "sum-2", user: "user-1", date: "2026-06-20", summary: "Learned some Rust." }
    ];

    const pb = mockPb({
      user_profile: mockCollection(userProfiles),
      session_summaries: mockCollection(sessionSummaries),
    });

    mockRunSimpleTask.mockResolvedValue(JSON.stringify({
      updatedBio: "Alice has been writing code and exploring Rust.",
      weeklyDigest: "Explored Rust and established project setup."
    }));

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
    });

    expect(result.cognitiveInertia?.userMdUpdated).toBe(true);
    expect(mockRunSimpleTask).toHaveBeenCalled();

    const expectedPath = join(process.cwd(), "dialogue-folio", "system", "USER.md").replace(/\\/g, "/");
    expect(mockFiles[expectedPath]).toContain("Alice has been writing code and exploring Rust.");

    expect(userProfiles[0].weeklyNotesSummaries).toContain("Explored Rust and established project setup.");
    expect(userProfiles[0].preferences.lastUserMdSynthesis).toBeGreaterThan(Date.now() - 10000);
  });

  it("should skip weekly USER.md profiling when less than 7 days have passed", async () => {
    const userProfiles = [
      {
        id: "prof-1",
        user: "user-1",
        name: "Alice",
        weeklyNotesSummaries: ["Old digest"],
        preferences: {
          lastUserMdSynthesis: Date.now() - 2 * 24 * 60 * 60 * 1000
        }
      }
    ];

    const pb = mockPb({
      user_profile: mockCollection(userProfiles),
    });

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
    });

    expect(result.cognitiveInertia?.userMdUpdated).toBe(false);
  });

  it("should trigger CONTEXT.md synthesis when workspace has activity today", async () => {
    const sessions = [
      { id: "sess-789", workspace: "ws-789" },
    ];
    const workspaces = [
      { id: "ws-789", name: "Rust Workspace" },
    ];
    const userProfiles = [
      { id: "prof-1", user: "user-1", preferences: {} },
    ];
    const tasks = [
      { id: "tsk-1", user: "user-1", workspace: "ws-789", text: "Write tests", completed: true, completedAt: Date.now() }
    ];
    const messages = [
      { id: "msg-1", session: "sess-789", author: "user", text: "Starting workspace work now.", timestamp: Date.now() }
    ];

    const pb = mockPb({
      chat_sessions: mockCollection(sessions),
      workspaces: mockCollection(workspaces),
      user_profile: mockCollection(userProfiles),
      tasks: mockCollection(tasks),
      messages: mockCollection(messages),
    });
    const contextMdPath = join(process.cwd(), "dialogue-folio", "workspaces", "rust-workspace-ws-789", "CONTEXT.md").replace(/\\/g, "/");
    mockFiles[contextMdPath] = "# Workspace Context\n\n## Goals\n- Build high performance Rust code.\n\n## Milestones\n- Write unit tests.\n";

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-789",
    });

    expect(result.cognitiveInertia?.contextMdUpdated).toBe(true);
    expect(mockFiles[contextMdPath]).toContain("Completed writing Vitest tests.");
    expect(mockSyncFolioFileToDb).toHaveBeenCalledWith(expect.stringContaining("CONTEXT.md"), pb, expect.any(String));
  });

  it("should trigger CONTEXT.md refinement loop when generated content exceeds 3000 characters", async () => {
    const sessions = [
      { id: "sess-999", workspace: "ws-999" },
    ];
    const workspaces = [
      { id: "ws-999", name: "Heavy Workspace" },
    ];
    const userProfiles = [
      { id: "prof-1", user: "user-1", preferences: {} },
    ];
    const tasks = [
      { id: "tsk-2", user: "user-1", workspace: "ws-999", text: "Write docs", completed: true, completedAt: Date.now() }
    ];
    const messages = [
      { id: "msg-2", session: "sess-999", author: "user", text: "Working hard today.", timestamp: Date.now() }
    ];

    const pb = mockPb({
      chat_sessions: mockCollection(sessions),
      workspaces: mockCollection(workspaces),
      user_profile: mockCollection(userProfiles),
      tasks: mockCollection(tasks),
      messages: mockCollection(messages),
    });

    const contextMdPath = join(process.cwd(), "dialogue-folio", "workspaces", "heavy-workspace-ws-999", "CONTEXT.md").replace(/\\/g, "/");
    mockFiles[contextMdPath] = "# Initial Context\n";

    mockRunSimpleTask.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes("weekly digest")) {
        return JSON.stringify({ updatedBio: "Bio", weeklyDigest: "Digest" });
      }
      if (prompt.includes("exceeds our strict budget of 3000 characters")) {
        return "# Condensed Context\n\n- Brief rule.";
      }
      if (prompt.includes("CONTEXT.md")) {
        return "# Extremely Long Context\n" + "A".repeat(3100);
      }
      return JSON.stringify([]);
    });

    const result = await runObserver(pb, {
      userId: "user-1",
      timezone: "Asia/Jakarta",
      sessionId: "sess-999",
    });

    expect(result.cognitiveInertia?.contextMdUpdated).toBe(true);
    expect(mockFiles[contextMdPath]).toBe("# Condensed Context\n\n- Brief rule.");
    expect(mockRunSimpleTask).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("exceeds our strict budget of 3000 characters")
    }));
  });
});
