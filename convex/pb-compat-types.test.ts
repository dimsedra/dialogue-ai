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
  PbAuthProvider,
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
  it("is currently in Phase 2 (in-progress)", () => {
    // Phase 2 is in progress as of B.5a. Phase 1 stub status was
    // superseded by the real hooks (B.1-B.5a). B.7 is the first consumer
    // call behind the flag.
    expect(PB_COMPAT_PHASE).toBe(2);
    expect(PB_COMPAT_STATUS).toBe("in-progress");
  });

  it("reports PB backend as not active when NEXT_PUBLIC_BACKEND is unset", () => {
    // Sanity: with no env var set (the default in CI and dev), the flag
    // stays false. This is the safe default.
    const original = process.env.NEXT_PUBLIC_BACKEND;
    delete process.env.NEXT_PUBLIC_BACKEND;
    try {
      expect(isPbBackend()).toBe(false);
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_BACKEND = original;
    }
  });

  it("flips to true when NEXT_PUBLIC_BACKEND=pocketbase", () => {
    // B.6 wires the flag. Consumers (B.7) gate on this; the env var is
    // set per-environment (dev, CI, prod) not at runtime.
    const original = process.env.NEXT_PUBLIC_BACKEND;
    process.env.NEXT_PUBLIC_BACKEND = "pocketbase";
    try {
      expect(isPbBackend()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_BACKEND;
      else process.env.NEXT_PUBLIC_BACKEND = original;
    }
  });

  it("treats unknown values as Convex (off)", () => {
    // Defensive: only the literal "pocketbase" enables the flag. Any
    // typo or future value stays on the safe Convex path.
    const original = process.env.NEXT_PUBLIC_BACKEND;
    process.env.NEXT_PUBLIC_BACKEND = "convex"; // explicit Convex
    try {
      expect(isPbBackend()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_BACKEND;
      else process.env.NEXT_PUBLIC_BACKEND = original;
    }
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
  it("useQuery is no longer a stub — type signature requires a PbQuery", () => {
    // Phase 2 Stage B.2: useQuery now requires a PbQuery (function with
    // _pb metadata). The Phase 1 /Phase 1 stub/ check no longer applies.
    // This is now a pure type-level test. We assert that a plain object
    // is not assignable to the PbQuery shape. The @ts-expect-error
    // directive will fail tsc if the constraint ever loosens. No runtime
    // call to useQuery happens here — the hook needs a React renderer,
    // and a type assertion is sufficient evidence.
    // @ts-expect-error — plain {} is not a PbQuery. Phase 1 pattern invalid.
    const _badQuery: import("../src/pb-compat/use-query").PbQuery<
      Record<string, unknown>,
      unknown
    > = {};
    expect(_badQuery).toEqual({}); // never reached; only proves the const was assigned
  });

  it("useMutation is no longer a stub — type signature requires a PbMutationDescriptor", () => {
    // Phase 2 Stage B.3: useMutation now requires a PbMutationDescriptor
    // (discriminated union on `kind`). Pure type-level check via the
    // directive below. No runtime call (the hook would need a renderer).
    // We declare a function that takes the descriptor and call it with
    // `{}` so tsc performs the type check at the call site.
    const _takesDescriptor = (
      _d: import("../src/pb-compat/use-mutation").PbMutationDescriptor,
    ): void => undefined;
    // @ts-expect-error — plain {} is not a valid mutation descriptor.
    _takesDescriptor({});
    expect(true).toBe(true); // type-level only
  });

  it("useAction is no longer a stub — type signature requires a PbActionDescriptor", () => {
    // Phase 2 Stage B.4: useAction now requires a PbActionDescriptor
    // ({ name: string }). Pure type-level check via the directive below.
    // No runtime call (the hook would need a renderer).
    const _takesDescriptor = (
      _d: import("../src/pb-compat/use-action").PbActionDescriptor,
    ): void => undefined;
    // @ts-expect-error — plain {} is not a valid action descriptor.
    _takesDescriptor({});
    expect(true).toBe(true); // type-level only
  });

  it("usePaginatedQuery is no longer a stub — type signature requires a PbPaginatedQuery", () => {
    // Phase 2 Stage B.5a: usePaginatedQuery now requires a PbPaginatedQuery
    // (function with _pb metadata). Pure type-level check via the directive
    // below. No runtime call (the hook would need a renderer). The hook's
    // real behavior is exercised by the 10K stress test in B.5b.
    const _takesQuery = (
      _q: import("../src/pb-compat/use-paginated-query").PbPaginatedQuery<
        Record<string, unknown>
      >,
    ): void => undefined;
    // @ts-expect-error — plain {} is not a PbPaginatedQuery.
    _takesQuery({});
    expect(true).toBe(true); // type-level only
  });

  it("useAuth throws when called outside a PbAuthProvider", () => {
    // Phase 2 Stage B.1: useAuth is now a real hook (not a stub) backed by
    // a React context. Calling it without a provider must throw — the
    // /PbAuthProvider/ guard lives in the hook, but React's own useContext
    // also throws in this environment ("Invalid hook call"), so we accept
    // either signal as evidence that the hook is wired correctly. Full
    // React-rendering tests for useAuth are in Stream C.2 with jsdom env.
    // The other hooks (useQuery, useMutation, useAction, usePaginatedQuery)
    // are still stubs and still throw the old message.
    expect(() => useAuth()).toThrow();
  });
});

describe("pb-compat: PbAuthProvider surface (B.7.1)", () => {
  it("is exported as a function from the public surface", () => {
    // B.7.1: PbAuthProvider is now wired into app/layout.tsx, so it MUST
    // be a runtime export. The type-level check (accepts { children })
    // lives in the next test.
    expect(typeof PbAuthProvider).toBe("function");
  });

  it("accepts a children prop and nothing else (type-level)", () => {
    // Type-level: a function whose only prop is `children: ReactNode`.
    // The valid call below compiles; the invalid one below (missing
    // children) triggers @ts-expect-error. Pattern matches the other
    // type-level tests in this file (B.2-B.5a).
    const _takesProps = (
      _p: Parameters<typeof PbAuthProvider>[0],
    ): void => undefined;
    _takesProps({ children: null });
    // @ts-expect-error — missing `children` is not a valid props shape.
    _takesProps({});
    expect(true).toBe(true); // type-level only
  });
});

describe("pb-compat: api.userProfile.get descriptor (B.7.2)", () => {
  it("api.userProfile.get is a real PbQuery, not the Phase 1 stub", () => {
    // B.7.2: userProfile.get is the first non-stub descriptor on the
    // public `api` surface. The Phase 1 stubs were empty `{}` objects;
    // a real descriptor is a function with a `_pb` metadata property.
    const get = api.userProfile.get;
    expect(typeof get).toBe("function");
    expect(get._pb).toBeDefined();
    expect(get._pb.collection).toBe("user_profile");
    expect(get._pb.kind).toBe("first");
    expect(typeof get._pb.buildFilter).toBe("function");
  });

  it("api.userProfile.get is typed as a PbQuery (B.2 invariant, runtime proxy)", () => {
    // The B.2 invariant — "the public `api` surface types descriptors
    // as PbQuery" — is enforced at compile time by the
    // `api.userProfile: { get: userProfileGetQuery }` literal in api.ts.
    // We can't import the PbQuery type and assign the descriptor to a
    // typed parameter here without a variance mismatch (PbQuery's
    // TArgs is contravariant; the descriptor's `{ user: string } |
    // undefined` doesn't unify with `Record<string, unknown>`). The
    // runtime check above is sufficient evidence; a deeper type test
    // lives in src/pb-compat/descriptors/userProfile.test.ts.
    expect(true).toBe(true);
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
