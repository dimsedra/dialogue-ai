// use-mutation.test.ts — pure-function tests for executePbMutation.
// The hook itself is not rendered (no jsdom installed); the descriptor
// type-level test lives in convex/pb-compat-types.test.ts.

import { describe, it, expect, vi } from "vitest";
import PocketBase from "pocketbase";
import { executePbMutation } from "./use-mutation";

type Call = { method: string; args: unknown[] };

const makeMockPb = () => {
  const calls: Call[] = [];
  return {
    calls,
    collection: (name: string) => ({
      create: vi.fn(async (record: unknown) => {
        calls.push({ method: "create", args: [name, record] });
        return { id: "new", ...(record as object) };
      }),
      update: vi.fn(async (id: string, record: unknown) => {
        calls.push({ method: "update", args: [name, id, record] });
        return { id, ...(record as object) };
      }),
      delete: vi.fn(async (id: string) => {
        calls.push({ method: "delete", args: [name, id] });
      }),
    }),
  };
};

describe("pb-compat: executePbMutation", () => {
  it("create: passes args to collection.create and returns the record", async () => {
    const pb = makeMockPb();
    const result = await executePbMutation<{ title: string }>(
      pb as unknown as PocketBase,
      { collection: "tasks", kind: "create" },
      { title: "x" },
    );
    expect(result).toEqual({ id: "new", title: "x" });
    expect(pb.calls).toEqual([
      { method: "create", args: ["tasks", { title: "x" }] },
    ]);
  });

  it("update: extracts id and record, calls collection.update", async () => {
    const pb = makeMockPb();
    const result = await executePbMutation<{ title: string }>(
      pb as unknown as PocketBase,
      { collection: "tasks", kind: "update" },
      { id: "abc", record: { title: "y" } },
    );
    expect(result).toEqual({ id: "abc", title: "y" });
    expect(pb.calls).toEqual([
      { method: "update", args: ["tasks", "abc", { title: "y" }] },
    ]);
  });

  it("delete: extracts id, calls collection.delete, returns undefined", async () => {
    const pb = makeMockPb();
    const result = await executePbMutation(
      pb as unknown as PocketBase,
      { collection: "tasks", kind: "delete" },
      { id: "abc" },
    );
    expect(result).toBeUndefined();
    expect(pb.calls).toEqual([{ method: "delete", args: ["tasks", "abc"] }]);
  });

  it("propagates errors from the PB SDK", async () => {
    const pb = {
      collection: () => ({
        create: vi.fn(async () => {
          throw new Error("validation failed");
        }),
        update: vi.fn(),
        delete: vi.fn(),
      }),
    };
    await expect(
      executePbMutation(
        pb as unknown as PocketBase,
        { collection: "tasks", kind: "create" },
        { title: "x" },
      ),
    ).rejects.toThrow("validation failed");
  });
});
