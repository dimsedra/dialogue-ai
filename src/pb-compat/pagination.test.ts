// pagination.test.ts — pure-function tests for the pagination helpers.

import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  appendOlderPage,
  prependNewItem,
  removeItemById,
  findPageOfItem,
  mergeRefetchedPage,
  handleCreateEvent,
  handleDeleteEvent,
  buildPageFilter,
  type PbItem,
} from "./pagination";

// Minimal item shape for tests.
type TestItem = PbItem & { title: string };

const items = (...titles: string[]): TestItem[] =>
  titles.map((title, i) => ({ id: `id${i + 1}`, title }));

describe("pb-compat: cursor encode/decode", () => {
  it("round-trips a cursor", () => {
    const cursor = { lastId: "abc123", pageSize: 50 };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("encoded cursor is base64url (URL-safe)", () => {
    const encoded = encodeCursor({ lastId: "x", pageSize: 1 });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("throws on non-base64 input", () => {
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow();
  });

  it("throws on non-JSON payload", () => {
    const notJson = Buffer.from("not json at all", "utf-8").toString("base64url");
    expect(() => decodeCursor(notJson)).toThrow();
  });

  it("throws on missing fields", () => {
    const bad = Buffer.from(JSON.stringify({ lastId: "x" }), "utf-8").toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });

  it("throws on wrong field types", () => {
    const bad = Buffer.from(
      JSON.stringify({ lastId: 123, pageSize: "50" }),
      "utf-8",
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });
});

describe("pb-compat: page mutations", () => {
  it("appendOlderPage: appends new items, returns a new array", () => {
    const existing: TestItem[] = [
      { id: "id1", title: "a" },
      { id: "id2", title: "b" },
    ];
    const newPage: TestItem[] = [
      { id: "id3", title: "c" },
      { id: "id4", title: "d" },
    ];
    const result = appendOlderPage(existing, newPage);
    expect(result).toEqual([
      { id: "id1", title: "a" },
      { id: "id2", title: "b" },
      { id: "id3", title: "c" },
      { id: "id4", title: "d" },
    ]);
    expect(result).not.toBe(existing);
  });

  it("appendOlderPage: empty new page is a no-op (but still new array)", () => {
    const existing = items("a", "b");
    expect(appendOlderPage(existing, [])).toEqual(existing);
    expect(appendOlderPage(existing, [])).not.toBe(existing);
  });

  it("prependNewItem: puts the new item at position 0", () => {
    const result = prependNewItem(items("a", "b"), { id: "id0", title: "z" });
    expect(result[0]).toEqual({ id: "id0", title: "z" });
    expect(result.length).toBe(3);
  });

  it("removeItemById: removes the matching item", () => {
    const existing: TestItem[] = [
      { id: "id1", title: "a" },
      { id: "id2", title: "b" },
      { id: "id3", title: "c" },
    ];
    const result = removeItemById(existing, "id2");
    expect(result).toEqual([
      { id: "id1", title: "a" },
      { id: "id3", title: "c" },
    ]);
  });

  it("removeItemById: returns the same array content if id not found", () => {
    const existing = items("a", "b");
    expect(removeItemById(existing, "missing")).toEqual(existing);
  });
});

describe("pb-compat: findPageOfItem", () => {
  it("returns the page-start and within-page index", () => {
    const all = items(...Array.from({ length: 25 }, (_, i) => `i${i}`));
    // page size 10, so id 'id11' (0-indexed: 10) is at page-start 10
    // (page 2). Map ids in the test to match.
    const result = findPageOfItem(all, "id11", 10);
    expect(result).toEqual({ pageStart: 10, pageIndex: 10 });
  });

  it("first page: pageStart is 0", () => {
    const all = items(...Array.from({ length: 25 }, (_, i) => `i${i}`));
    expect(findPageOfItem(all, "id3", 10)).toEqual({ pageStart: 0, pageIndex: 2 });
  });

  it("last partial page: pageStart is the last full page boundary", () => {
    const all = items(...Array.from({ length: 25 }, (_, i) => `i${i}`));
    // id 'id25' is index 24, which is on page 2 (indices 20-24).
    expect(findPageOfItem(all, "id25", 10)).toEqual({ pageStart: 20, pageIndex: 24 });
  });

  it("returns null when id is not present", () => {
    expect(findPageOfItem(items("a", "b"), "missing", 10)).toBeNull();
  });

  it("returns null when pageSize is non-positive", () => {
    expect(findPageOfItem(items("a"), "id1", 0)).toBeNull();
    expect(findPageOfItem(items("a"), "id1", -1)).toBeNull();
  });
});

describe("pb-compat: mergeRefetchedPage", () => {
  it("replaces items at the given page-start", () => {
    const existing = items("a", "b", "c", "d", "e");
    const refetched = [
      { id: "id1", title: "A" },
      { id: "id2", title: "B" },
    ];
    const result = mergeRefetchedPage(existing, refetched, 0);
    expect(result).toEqual([
      { id: "id1", title: "A" },
      { id: "id2", title: "B" },
      { id: "id3", title: "c" },
      { id: "id4", title: "d" },
      { id: "id5", title: "e" },
    ]);
  });

  it("handles a shorter refetch (item was deleted)", () => {
    const existing = items("a", "b", "c", "d", "e");
    const refetched = [{ id: "id1", title: "A" }];
    const result = mergeRefetchedPage(existing, refetched, 0);
    expect(result).toEqual([
      { id: "id1", title: "A" },
      { id: "id2", title: "b" }, // unchanged
      { id: "id3", title: "c" }, // unchanged
      { id: "id4", title: "d" }, // unchanged
      { id: "id5", title: "e" }, // unchanged
    ]);
  });
});

describe("pb-compat: handleCreateEvent", () => {
  it("prepends when the new id is greater than the newest loaded id", () => {
    // "z9" is lexicographically greater than "id1" (newest in existing).
    const existing = [{ id: "id1", title: "a" }];
    const newItem: TestItem = { id: "z9", title: "newer" };
    const result = handleCreateEvent(existing, newItem);
    expect(result[0].id).toBe("z9");
    expect(result[0].title).toBe("newer");
  });

  it("ignores items with id <= newest (older than what we have)", () => {
    const existing = [{ id: "z9", title: "newest" }];
    // "a1" < "z9" lexicographically
    const result = handleCreateEvent(existing, { id: "a1", title: "older" });
    expect(result).toBe(existing);
  });

  it("prepends when results is empty", () => {
    const result = handleCreateEvent([], { id: "abc", title: "first" });
    expect(result).toEqual([{ id: "abc", title: "first" }]);
  });
});

describe("pb-compat: handleDeleteEvent", () => {
  it("removes the item if present", () => {
    const existing: TestItem[] = [
      { id: "id1", title: "a" },
      { id: "id2", title: "b" },
      { id: "id3", title: "c" },
    ];
    const result = handleDeleteEvent(existing, "id2");
    expect(result).toEqual([
      { id: "id1", title: "a" },
      { id: "id3", title: "c" },
    ]);
  });

  it("returns same content if id not present", () => {
    const existing = items("a", "b");
    expect(handleDeleteEvent(existing, "missing")).toEqual(existing);
  });
});

describe("pb-compat: buildPageFilter", () => {
  it("returns empty string when both inputs are empty/null", () => {
    expect(buildPageFilter("", null)).toBe("");
  });

  it("returns the base filter when afterId is null", () => {
    expect(buildPageFilter(`sessionId = "abc"`, null)).toBe(`sessionId = "abc"`);
  });

  it("adds the cursor filter when afterId is set and base is empty", () => {
    expect(buildPageFilter("", "xyz")).toBe(`id < "xyz"`);
  });

  it("combines both filters with &&", () => {
    expect(buildPageFilter(`sessionId = "abc"`, "xyz")).toBe(
      `sessionId = "abc" && id < "xyz"`,
    );
  });
});
