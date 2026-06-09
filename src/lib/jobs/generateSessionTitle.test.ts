// Unit tests for generateSessionTitle — Phase 6.1.1.
//
// These tests exercise the function's branching logic with mocked
// PocketBase + mocked LLM imports. The PB integration is validated
// by the smoke test (scripts/smoke-pb-jobs.mjs).
//
// Mock strategy:
//   - The PB client is mocked at the `getOne` / `getFirstListItem` /
//     `getList` / `update` level.
//   - The `../ai-providers` module is mocked at the dynamic
//     `import()` level. Vitest's `vi.mock` can't intercept dynamic
//     imports from inside `generateSessionTitle`, so we mock the
//     `runSimpleTask` and `getTaskProviderAndModel` via module-level
//     hoisted mocks on the module's exports.
//   - The `../encryption` module's `decrypt` is mocked similarly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";

// ---------------------------------------------------------------------------
// Mock the heavy LLM modules that generateSessionTitle imports dynamically.
// We hoist the mocks to the top of the file (Vitest will lift them).
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

// After the hoisted mocks, import the function under test.
const { generateSessionTitle } = await import(
  "../../../src/lib/jobs/generateSessionTitle"
);

// ---------------------------------------------------------------------------
// Helper: create a minimal mock PB client with the methods the function uses.
// ---------------------------------------------------------------------------

/** A mock PB collection with all the methods the function calls. */
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  mockRunSimpleTask.mockResolvedValue("Test Title");
  mockGetTaskProviderAndModel.mockReturnValue({
    provider: "gemini",
    modelId: "gemini-2.5-flash",
  });
  mockDecrypt.mockImplementation((s: string) => Promise.resolve(s));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateSessionTitle", () => {
  it("returns skipped_no_session when session does not exist", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockRejectedValue({ status: 404 }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "nonexistent",
    });
    expect(result).toEqual({ status: "skipped_no_session" });
    // Should not attempt any further queries
    expect(sessions.getOne).toHaveBeenCalledTimes(1);
  });

  it("returns skipped_unauthorized when session.user !== userId", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({ id: "s1", user: "other-user" }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({ status: "skipped_unauthorized" });
  });

  it("returns skipped_non_default when title is not a default pattern", async () => {
    const sessions = mockCollection({
      getOne: vi.fn().mockResolvedValue({
        id: "s1",
        user: "user1",
        title: "Japan trip planning",
      }),
    });
    const pb = mockPb({ chat_sessions: sessions });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({
      status: "skipped_non_default",
      existingTitle: "Japan trip planning",
    });
  });

  it("proceeds when title is a default pattern (Chat ...)", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat 2026-01-01" }),
      update: vi.fn().mockResolvedValue({}),
    });
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: { provider: "gemini", taskModels: { title: "gemini-2.5-flash" } },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [
          { author: "User", text: "Hello" },
          { author: "AI", text: "Hi" },
        ],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({ status: "updated", title: "Test Title" });
    expect(mockRunSimpleTask).toHaveBeenCalledWith({
      provider: "gemini",
      customConfigs: {},
      prompt: expect.stringContaining("Hello"),
      modelId: "gemini-2.5-flash",
    });
    expect(sessions.update).toHaveBeenCalledWith("s1", { title: "Test Title" });
  });

  it("proceeds when title is 'New Chat' pattern", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "New Chat" }),
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
        items: [{ author: "User", text: "Hello" }],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({ status: "updated", title: "Test Title" });
  });

  it("returns skipped_no_messages when no messages exist", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat test" }),
    });
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: { provider: "gemini" },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({ items: [] }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({ status: "skipped_no_messages" });
  });

  it("returns failed_llm when the LLM call throws", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat test" }),
    });
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: { provider: "gemini" },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [{ author: "User", text: "Hello" }],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    mockRunSimpleTask.mockRejectedValue(new Error("API key not found"));

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({
      status: "failed_llm",
      error: expect.stringContaining("API key not found"),
    });
    // Session should NOT be updated
    expect(sessions.update).not.toHaveBeenCalled();
  });

  it("returns skipped_short_title when title is <= 2 chars", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat test" }),
    });
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: { provider: "gemini" },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [{ author: "User", text: "Hello" }],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    mockRunSimpleTask.mockResolvedValue("Hi");

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    expect(result).toEqual({ status: "skipped_short_title" });
    expect(sessions.update).not.toHaveBeenCalled();
  });

  it("decrypts customConfigs before passing to LLM", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat test" }),
      update: vi.fn().mockResolvedValue({}),
    });
    mockDecrypt.mockImplementation((s) => Promise.resolve(s === "enc:abc" ? "real-key" : s));
    const profiles = mockCollection({
      getFirstListItem: vi.fn().mockResolvedValue({
        id: "p1",
        preferences: {
          provider: "openai",
          customConfigs: {
            openai: { apiKey: "enc:abc", baseUrl: "" },
          },
        },
      }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [{ author: "User", text: "Hello" }],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    mockGetTaskProviderAndModel.mockReturnValue({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });

    await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });

    expect(mockDecrypt).toHaveBeenCalledWith("enc:abc");
    // The decrypted key should be passed to runSimpleTask
    const callArg = mockRunSimpleTask.mock.calls[0][0];
    expect(callArg.customConfigs.openai.apiKey).toBe("real-key");
  });

  it("handles missing profile gracefully (404)", async () => {
    const sessions = mockCollection({
      getOne: vi
        .fn()
        .mockResolvedValue({ id: "s1", user: "user1", title: "Chat test" }),
      update: vi.fn().mockResolvedValue({}),
    });
    const profiles = mockCollection({
      // No profile yet — 1st-time user
      getFirstListItem: vi.fn().mockRejectedValue({ status: 404 }),
    });
    const msgs = mockCollection({
      getList: vi.fn().mockResolvedValue({
        items: [{ author: "User", text: "Hello" }],
      }),
    });
    const pb = mockPb({
      chat_sessions: sessions,
      user_profile: profiles,
      messages: msgs,
    });

    const result = await generateSessionTitle(pb, {
      userId: "user1",
      sessionId: "s1",
    });
    // Should fall back to defaults and still work
    expect(result).toEqual({ status: "updated", title: "Test Title" });
    expect(mockGetTaskProviderAndModel).toHaveBeenCalled();
  });
});
