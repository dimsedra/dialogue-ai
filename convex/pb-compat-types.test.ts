// Phase 1 type-level test for the pb-compat surface.
//
// This test does NOT exercise runtime behaviour. Every hook in pb-compat/hooks.ts
// throws on call. The test's job is to prove that:
//   1. The types in pb-compat/_generated/dataModel.ts compile.
//   2. The PbRecordMap has an entry for every collection in the migration.
//   3. The branded PbId<T> is assignable from a string at trust boundaries.
//   4. The Convex `Id<T>` and `Doc<T>` patterns have a direct analog.
//   5. The isPbBackend() check is wired and currently returns false.
//
// If the migration file pb_migrations/1700000000_init_collections.js is changed
// without updating the type surface, this test catches the mismatch at compile
// time (via the typed constants below).
//
// Run: `npm run test` (vitest, with --typecheck on via tsconfig).

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  api,
  isPbBackend,
  PB_COMPAT_PHASE,
  PB_COMPAT_STATUS,
  pbId,
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
  useAuth,
  type PbId,
  type PbRecord,
  type PbRecordMap,
  type PbCollectionName,
  type PbMemories,
  type PbTasks,
  type PbEvents,
  type PbUsers,
  type PaginationStatus,
  type UsePaginatedQueryResult,
} from "../src/pb-compat";

describe("pb-compat: phase status", () => {
  it("is currently in Phase 1 stub mode", () => {
    expect(PB_COMPAT_PHASE).toBe(1);
    expect(PB_COMPAT_STATUS).toBe("stub");
  });

  it("reports PB backend as not active in Phase 1", () => {
    expect(isPbBackend()).toBe(false);
  });
});

describe("pb-compat: api surface exists", () => {
  it("exports a frozen api object", () => {
    expect(api).toBeDefined();
    expect(Object.isFrozen(api)).toBe(true);
  });

  it("has all 19 app collection namespaces as top-level keys", () => {
    const expectedNamespaces = [
      "users",
      "workspaces",
      "chatSessions",
      "agentPersonas",
      "messages",
      "tasks",
      "userProfile",
      "memories",
      "events",
      "reflections",
      "userImages",
      "habits",
      "habitLogs",
      "pageSettings",
      "sessionSummaries",
      "weeklyDigests",
      "archivedSummaries",
      "notifications",
      "pushSubscriptions",
      "cardState",
    ];
    for (const ns of expectedNamespaces) {
      expect(api).toHaveProperty(ns);
    }
  });
});

describe("pb-compat: hooks throw in Phase 1", () => {
  it("useQuery throws with a clear Phase 1 stub message", () => {
    expect(() => useQuery({} as unknown, {})).toThrow(/Phase 1 stub/);
  });

  it("useMutation throws", () => {
    expect(() => useMutation({} as unknown)).toThrow(/Phase 1 stub/);
  });

  it("useAction throws", () => {
    expect(() => useAction({} as unknown)).toThrow(/Phase 1 stub/);
  });

  it("usePaginatedQuery throws", () => {
    expect(() => usePaginatedQuery({} as unknown, {}, { initialNumItems: 10 })).toThrow(
      /Phase 1 stub/,
    );
  });

  it("useAuth throws", () => {
    expect(() => useAuth()).toThrow(/Phase 1 stub/);
  });
});

describe("pb-compat: branded PbId type", () => {
  it("PbId<T> is assignable from a string at trust boundaries", () => {
    const id = pbId<"workspaces">("abc123");
    // Runtime: it's still a string
    expect(typeof id).toBe("string");
    expect(id).toBe("abc123");
  });

  it("PbId<T> is structurally a string", () => {
    expectTypeOf<PbId<"workspaces">>().toMatchTypeOf<string>();
  });
});

describe("pb-compat: PbRecordMap has every collection", () => {
  it("contains all 20 PB collections as keys", () => {
    type ExpectedKeys =
      | "users"
      | "agent_personas"
      | "workspaces"
      | "chat_sessions"
      | "messages"
      | "tasks"
      | "user_profile"
      | "memories"
      | "events"
      | "reflections"
      | "user_images"
      | "habits"
      | "habit_logs"
      | "page_settings"
      | "session_summaries"
      | "weekly_digests"
      | "archived_summaries"
      | "notifications"
      | "push_subscriptions"
      | "card_state"
      | "scheduled_notifications";

    expectTypeOf<keyof PbRecordMap>().toEqualTypeOf<ExpectedKeys>();
  });

  it("PbCollectionName is the union of PbRecordMap keys", () => {
    expectTypeOf<PbCollectionName>().toEqualTypeOf<keyof PbRecordMap>();
  });
});

describe("pb-compat: per-collection record shapes", () => {
  it("PbMemories has the 384d embedding typed as number[]", () => {
    expectTypeOf<PbMemories["embedding"]>().toEqualTypeOf<number[]>();
  });

  it("PbMemories.user is a branded PbId<users>", () => {
    expectTypeOf<PbMemories["user"]>().toMatchTypeOf<PbId<"users">>();
  });

  it("PbTasks has the priority union literal type", () => {
    type Priority = PbTasks["priority"];
    expectTypeOf<NonNullable<Priority>>().toEqualTypeOf<"low" | "medium" | "high">();
  });

  it("PbEvents supports self-reference via series", () => {
    expectTypeOf<PbEvents["series"]>().toMatchTypeOf<PbId<"events"> | undefined>();
  });

  it("PbUsers has the authTables custom fields", () => {
    expectTypeOf<PbUsers["name"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<PbUsers["isAnonymous"]>().toEqualTypeOf<boolean | undefined>();
  });
});

describe("pb-compat: UsePaginatedQueryResult shape", () => {
  it("has results, status, and loadMore", () => {
    type R = UsePaginatedQueryResult<{ id: string }>;
    expectTypeOf<R["results"]>().toEqualTypeOf<Array<{ id: string }>>();
    expectTypeOf<R["status"]>().toEqualTypeOf<PaginationStatus>();
    expectTypeOf<R["loadMore"]>().toBeFunction();
  });
});

describe("pb-compat: Convex Id/Doc pattern equivalence", () => {
  it("PbId<users> is the analog of Convex Id<users>", () => {
    // Both are branded strings; both are not assignable to each other by structure
    // (brands differ), but both are assignable from `string`.
    const s: string = "abc";
    const pbUserId: PbId<"users"> = s as PbId<"users">;
    expect(typeof pbUserId).toBe("string");
  });

  it("PbRecord is the analog of Convex Doc", () => {
    // PbRecord is the base shape; specific record types extend it.
    const baseRecord: PbRecord = {
      id: "x" as PbId,
      collectionId: "y",
      collectionName: "users",
    };
    expect(baseRecord.id).toBe("x");
  });
});
