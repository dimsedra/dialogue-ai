import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";
import { join } from "path";

// ---------------------------------------------------------------------------
// Hoisted mocks for dynamic imports
// ---------------------------------------------------------------------------
const mockRunSimpleTask = vi.fn();
const mockGetTaskProviderAndModel = vi.fn();
const mockDecrypt = vi.fn();

vi.mock("../ai-providers", () => ({
  runSimpleTask: mockRunSimpleTask,
  getTaskProviderAndModel: mockGetTaskProviderAndModel,
}));

vi.mock("../encryption", () => ({
  decrypt: mockDecrypt,
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
    readdirSync: (p: any) => {
      const norm = String(p).replace(/\\/g, "/");
      const prefix = norm + "/";
      const results = new Set<string>();
      for (const k of Object.keys(mockFiles)) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const slashIdx = rest.indexOf("/");
          if (slashIdx === -1) {
            results.add(rest);
          } else {
            results.add(rest.slice(0, slashIdx));
          }
        }
      }
      return Array.from(results);
    },
  };
  return {
    ...mocked,
    default: mocked,
  };
});

// Import the function under test
const { generateDailySummary } = await import("./generateDailySummary");

function mockCollection(overrides = {}) {
  const items: any[] = overrides.hasOwnProperty("items") ? (overrides as any).items : [];
  return {
    items,
    getOne: vi.fn(),
    getFirstListItem: vi.fn().mockImplementation(async (filter: string) => {
      const found = items[0]; // Simple first item return for testing
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
    ...overrides,
  };
}

function mockPb(collections: Record<string, any>) {
  const pb = { authStore: { save: vi.fn(), token: "mock-token", record: { id: "user-1", collectionName: "users" } } } as any;
  pb.collection = vi.fn((name: string) => {
    return collections[name];
  });
  return pb;
}

describe("generateDailySummary Synthesis Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSimpleTask.mockResolvedValue("Reflected chat session thoughts summary.");
    mockGetTaskProviderAndModel.mockReturnValue({ provider: "gemini", modelId: "gemini-2.5-flash" });
    mockDecrypt.mockImplementation((s: string) => Promise.resolve(s));
    // Clear virtual files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
  });

  it("should successfully synthesize daily logs and workspace activity logs", async () => {
    const userProfileCollection = mockCollection({
      items: [{ id: "prof-1", preferences: { provider: "gemini" } }],
    });

    const workspacesCollection = mockCollection({
      items: [{ id: "ws-1", name: "Dialogue App" }],
    });

    const chatSessionsCollection = mockCollection({
      items: [
        { id: "sess-global", title: "General Discussion", user: "user-1" },
        { id: "sess-ws", title: "Coding Tasks", user: "user-1", workspace: "ws-1" },
      ],
    });

    const messagesCollection = mockCollection({
      items: [
        { id: "msg-1", session: "sess-global", author: "user", text: "Hello", timestamp: Date.now() },
        { id: "msg-2", session: "sess-global", author: "assistant", text: "Hi there", timestamp: Date.now() },
        { id: "msg-3", session: "sess-ws", author: "user", text: "Fix this vitest bug", timestamp: Date.now() },
      ],
    });

    const tasksCollection = mockCollection({
      items: [
        { id: "task-1", text: "Release app", completed: true, completedAt: Date.now(), user: "user-1" },
        { id: "task-2", text: "Run test suite", completed: true, completedAt: Date.now(), user: "user-1", workspace: "ws-1" },
      ],
    });

    const eventsCollection = mockCollection({
      items: [
        { id: "event-1", title: "Global Sync", startTime: Date.now(), user: "user-1" },
        { id: "event-2", title: "Sprint Backlog", startTime: Date.now(), user: "user-1", workspace: "ws-1" },
      ],
    });

    const habitsCollection = mockCollection({
      items: [
        { id: "habit-1", name: "Drink Water", archived: false },
        { id: "habit-2", name: "Workout", archived: false },
      ],
    });

    const habitLogsCollection = mockCollection({
      items: [
        { id: "hlog-1", habit: "habit-1", status: "completed", dateString: "2026-06-17" },
      ],
    });

    const sessionSummariesCollection = mockCollection({ items: [] });

    const pb = mockPb({
      user_profile: userProfileCollection,
      workspaces: workspacesCollection,
      chat_sessions: chatSessionsCollection,
      messages: messagesCollection,
      tasks: tasksCollection,
      events: eventsCollection,
      habits: habitsCollection,
      habit_logs: habitLogsCollection,
      session_summaries: sessionSummariesCollection,
    });

    // Run synthesis
    const result = await generateDailySummary(pb, {
      userId: "user-1",
      timezone: "UTC",
    });

    expect(result.status).toBe("created");
    expect(result.summary).toContain("Reflected chat session thoughts summary.");

    // Retrieve today's date string
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });

    // Verify global daily log file
    const globalLogPath = `${process.cwd().replace(/\\/g, "/")}/dialogue-folio/daily-logs/${todayStr}.md`;
    expect(mockFiles[globalLogPath]).toBeDefined();

    const globalContent = mockFiles[globalLogPath];
    expect(globalContent).toContain("type: daily-log");
    expect(globalContent).toContain("- [x] Drink Water");
    expect(globalContent).toContain("- [ ] Workout");
    expect(globalContent).toContain("- **General Discussion**: Reflected chat session thoughts summary.");
    expect(globalContent).toContain(`- [x] task-task-1: Release app`);
    expect(globalContent).toContain(`- [x] event-event-1: Global Sync`);

    // Verify workspace activity log file
    const wsLogPath = `${process.cwd().replace(/\\/g, "/")}/dialogue-folio/workspaces/dialogue-app-ws-1/activity/${todayStr}.md`;
    expect(mockFiles[wsLogPath]).toBeDefined();

    const wsContent = mockFiles[wsLogPath];
    expect(wsContent).toContain("type: workspace-activity");
    expect(wsContent).toContain("workspace: ws-1");
    expect(wsContent).toContain("- **Coding Tasks**: Reflected chat session thoughts summary.");
    expect(wsContent).toContain(`- [x] task-task-2: Run test suite`);
    expect(wsContent).toContain(`- [x] event-event-2: Sprint Backlog`);

    // Verify DB cache updated
    expect(sessionSummariesCollection.create).toHaveBeenCalled();
  });

  it("should preserve checked habits when global daily log file already exists", async () => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
    const globalLogPath = `${process.cwd().replace(/\\/g, "/")}/dialogue-folio/daily-logs/${todayStr}.md`;

    // Seed file with habit-2 (Workout) already completed by the user in markdown
    mockFiles[globalLogPath] = `---
date: ${todayStr}
type: daily-log
---

# Daily Log - ${todayStr}

## Today's Habits
- [ ] Drink Water
- [x] Workout
`;

    const userProfileCollection = mockCollection({
      items: [{ id: "prof-1", preferences: { provider: "gemini" } }],
    });
    const workspacesCollection = mockCollection({ items: [] });
    const chatSessionsCollection = mockCollection({ items: [] });
    const messagesCollection = mockCollection({ items: [] });
    const tasksCollection = mockCollection({ items: [] });
    const eventsCollection = mockCollection({ items: [] });
    const sessionSummariesCollection = mockCollection({ items: [] });

    const habitsCollection = mockCollection({
      items: [
        { id: "habit-1", name: "Drink Water", archived: false },
        { id: "habit-2", name: "Workout", archived: false },
      ],
    });
    const habitLogsCollection = mockCollection({ items: [] });

    const pb = mockPb({
      user_profile: userProfileCollection,
      workspaces: workspacesCollection,
      chat_sessions: chatSessionsCollection,
      messages: messagesCollection,
      tasks: tasksCollection,
      events: eventsCollection,
      habits: habitsCollection,
      habit_logs: habitLogsCollection,
      session_summaries: sessionSummariesCollection,
    });

    await generateDailySummary(pb, {
      userId: "user-1",
      timezone: "UTC",
    });

    const updatedContent = mockFiles[globalLogPath];
    // habit-2 must remain checked, and habit-1 remains unchecked
    expect(updatedContent).toContain("- [ ] Drink Water");
    expect(updatedContent).toContain("- [x] Workout");
  });
});
