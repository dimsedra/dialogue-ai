import { describe, test, expect } from "vitest";
import {
  encodeArgsAsFilter,
  argsKey,
  defineQuery,
  type PbQuery,
} from "./use-query";

describe("encodeArgsAsFilter", () => {
  test("returns empty string for undefined args", () => {
    expect(encodeArgsAsFilter(undefined)).toBe("");
  });

  test("returns empty string for empty args", () => {
    expect(encodeArgsAsFilter({})).toBe("");
  });

  test("encodes a single string field", () => {
    expect(encodeArgsAsFilter({ userId: "abc" })).toBe('userId = "abc"');
  });

  test("encodes a number field", () => {
    expect(encodeArgsAsFilter({ priority: 1 })).toBe("priority = 1");
  });

  test("encodes a boolean field", () => {
    expect(encodeArgsAsFilter({ completed: true })).toBe("completed = true");
    expect(encodeArgsAsFilter({ completed: false })).toBe("completed = false");
  });

  test("combines multiple fields with `&&`", () => {
    expect(
      encodeArgsAsFilter({ userId: "abc", completed: false, priority: 2 }),
    ).toBe('userId = "abc" && completed = false && priority = 2');
  });

  test("skips undefined and null values", () => {
    expect(
      encodeArgsAsFilter({ userId: "abc", missing: undefined, alsoMissing: null }),
    ).toBe('userId = "abc"');
  });

  test("escapes embedded double quotes in string values", () => {
    expect(encodeArgsAsFilter({ name: 'a"b' })).toBe('name = "a\\"b"');
  });

  test("escapes embedded backslashes in string values", () => {
    expect(encodeArgsAsFilter({ name: "a\\b" })).toBe('name = "a\\\\b"');
  });

  test("skips NaN and Infinity", () => {
    expect(encodeArgsAsFilter({ n: NaN })).toBe("");
    expect(encodeArgsAsFilter({ n: Infinity })).toBe("");
    expect(encodeArgsAsFilter({ n: -Infinity })).toBe("");
  });

  test("silently skips non-primitive types (objects, arrays) — they need explicit extension", () => {
    expect(encodeArgsAsFilter({ a: { nested: 1 } })).toBe("");
    expect(encodeArgsAsFilter({ a: [1, 2, 3] })).toBe("");
  });

  test("is deterministic — same args produce the same filter", () => {
    const args = { userId: "abc", completed: false };
    expect(encodeArgsAsFilter(args)).toBe(encodeArgsAsFilter(args));
  });

  test("is order-stable on object literal — Object.entries preserves insertion order in modern engines", () => {
    expect(encodeArgsAsFilter({ a: 1, b: 2 })).toBe("a = 1 && b = 2");
  });
});

describe("argsKey", () => {
  test("matches encodeArgsAsFilter for any input", () => {
    // argsKey is defined as a thin wrapper over encodeArgsAsFilter, but
    // pin the equivalence so future refactors don't drift.
    const cases: Array<Record<string, unknown> | undefined> = [
      undefined,
      {},
      { a: 1 },
      { a: "x", b: true },
    ];
    for (const args of cases) {
      expect(argsKey(args)).toBe(encodeArgsAsFilter(args));
    }
  });
});

describe("defineQuery", () => {
  test("returns a callable that delegates to the implementation", async () => {
    const q = defineQuery<{ id: string }, { id: string; name: string }>(
      { collection: "workspaces", kind: "get" },
      async (args) => ({ id: args.id, name: "test" }),
    );
    const result = await q({ id: "abc" });
    expect(result).toEqual({ id: "abc", name: "test" });
  });

  test("attaches the descriptor at _pb (non-enumerable, non-writable)", () => {
    const q = defineQuery<unknown, unknown>(
      { collection: "tasks", kind: "list" },
      async () => [],
    );
    expect(q._pb).toEqual({ collection: "tasks", kind: "list" });
    // The descriptor is not enumerable on the function itself.
    expect(Object.keys(q)).not.toContain("_pb");
  });

  test("descriptor is read-only — reassignment throws in strict mode", () => {
    "use strict";
    const q = defineQuery<unknown, unknown>(
      { collection: "tasks", kind: "list" },
      async () => [],
    );
    expect(() => {
      // @ts-expect-error — _pb is readonly, this assignment is forbidden.
      q._pb = { collection: "events", kind: "list" };
    }).toThrow();
  });

  test("two defineQuery calls produce distinct function references", () => {
    const a = defineQuery<unknown, unknown>(
      { collection: "tasks", kind: "list" },
      async () => [],
    );
    const b = defineQuery<unknown, unknown>(
      { collection: "tasks", kind: "list" },
      async () => [],
    );
    expect(a).not.toBe(b);
    // But the descriptors are equivalent.
    expect(a._pb).toEqual(b._pb);
  });
});

describe("PbQuery type", () => {
  // Type-level smoke test: a defineQuery result is assignable to PbQuery.
  test("defineQuery result satisfies PbQuery<TArgs, TResult>", () => {
    const q: PbQuery<{ id: string }, { id: string }> = defineQuery(
      { collection: "workspaces", kind: "get" },
      async (args) => ({ id: args.id }),
    );
    // Compile-time check only.
    expect(q._pb.collection).toBe("workspaces");
  });
});
