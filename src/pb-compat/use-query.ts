// PocketBase-backed useQuery — Phase 2 Stage B.2.
//
// What this file does:
//   - Defines `PbQuery<T>`: a function reference with a `_pb` metadata field
//     that tells useQuery which collection to query, what kind of query
//     (list/get/first), and which field to match on for `get`.
//   - Defines `defineQuery<TArgs, T>(descriptor, impl)`: the helper that
//     creates a `PbQuery` from a descriptor and an implementation function.
//   - Replaces the Phase 1 useQuery stub with a real implementation that:
//       1. Reads the `_pb` metadata to know which PB collection to query.
//       2. Encodes `args` into a PB filter string (basic, primitive-only).
//       3. Fetches on mount + on args change.
//       4. Subscribes to `pb.collection(name).subscribe('*', cb)` and
//          re-fetches on any change in the matching collection.
//       5. Cleans up the subscription on unmount (per-call subscription,
//          decision Q3 in `phase-2-adapter.md`).
//   - Returns `T | undefined` to match the Convex useQuery shape (data is
//     `undefined` while loading, on error, or when the result is empty).
//
// Why a separate file (and not hooks.ts)?
//   - Decision Q1 in `phase-2-adapter.md`: one file per heavy hook.
//   - useQuery is ~100 LOC of effect plumbing; a separate file makes the
//     subscription lifecycle readable.
//
// Phase 2 safety:
//   - Until Stage B.6 flips `isPbBackend()` to read the env var, nothing
//     actually calls this hook from the live app.
//   - The hook calls `getPbClient()` on every render. That's fine: it's a
//     singleton. If the env changes at runtime (test reset), the next
//     useEffect cycle picks up the new client because the deps array
//     includes the query reference (and defineQuery returns a stable
//     reference per call site).
//
// Filter encoding (basic):
//   - Supports equality on string / number / boolean fields.
//   - Empty / undefined args → no filter.
//   - Operators (>, <, ~, etc.) and array-contains are NOT in scope for
//     B.2; they will be added when a call site needs them. The basic
//     encoder handles the first read-path call (B.7) and the majority
//     of list queries.
//
// What this module does NOT do (deferred):
//   - Optimistic updates. Decision Q5: parity, not better.
//   - Result deduplication across hook instances. Per-call subscription.
//   - Server-side rendering. SSR-safe stubs need a different approach;
//     consumers are expected to gate on `isPbBackend()` (or use Convex).

import { useEffect, useState } from "react";
import { getPbClient } from "./client";
import type { PbCollectionName } from "./_generated/dataModel";

// =============================================================================
// Query descriptor — the metadata that defines a query.
// =============================================================================

export type PbQueryKind = "list" | "get" | "first";

export interface PbQueryDescriptor<T> {
  /** PB collection name (e.g. "workspaces", "tasks"). */
  collection: PbCollectionName;
  /** Query shape. */
  kind: PbQueryKind;
  /**
   * For `kind: "get"`: which field of `args` to match against the PB
   * record's field of the same name. Defaults to "id".
   *
   * For `kind: "list"`: optional. If set, applies a `sort` clause to the
   * query.
   */
  matchField?: string;
  /**
   * For `kind: "list"`: optional max items to return. Defaults to 100.
   * PB's getList caps at 500; we keep the default conservative.
   */
  limit?: number;
  /**
   * Optional custom filter builder for `kind: "first"` and `kind: "list"`.
   * When set, used INSTEAD of `encodeArgsAsFilter(args)`. Lets a query
   * encode filters that need access to runtime state the args object
   * doesn't carry (e.g. the current user id from `pb.authStore.record`,
   * or a field name that doesn't match the args key).
   *
   * For "first" queries that should return undefined when no record
   * matches, return a tautologically-false filter like `"1 = 2"` —
   * `getList(1, 1, { filter: "1 = 2" })` returns `{ items: [] }`.
   *
   * B.7.2: introduced for `api.userProfile.get`, which needs to filter
   * by the current user (read from auth state) rather than an arg.
   */
  buildFilter?: (args: Record<string, unknown> | undefined) => string;
  /**
   * Type-only marker so the generic param compiles when callers write
   * `PbQueryDescriptor<MyType>` without otherwise using the type. The
   * runtime never constructs one of these without `collection` and `kind`.
   */
  readonly __resultType?: T;
}

// =============================================================================
// PbQuery — a function reference with attached metadata.
// =============================================================================

export interface PbQuery<TArgs = Record<string, unknown>, TResult = unknown> {
  (args: TArgs): Promise<TResult>;
  readonly _pb: PbQueryDescriptor<TResult>;
}

/**
 * Create a `PbQuery` from a descriptor and an implementation function. The
 * implementation function is what the caller invokes directly (e.g.
 * `api.userProfile.get({ userId })`); the descriptor is what `useQuery`
 * reads to wire up the reactive subscription.
 *
 * Most call sites will use `defineQuery` once per logical query and store
 * the result in a typed `api` namespace. That wiring is part of B.3+; this
 * commit ships the helper.
 */
export function defineQuery<TArgs, TResult>(
  descriptor: PbQueryDescriptor<TResult>,
  impl: (args: TArgs) => Promise<TResult>,
): PbQuery<TArgs, TResult> {
  const fn = ((args: TArgs) => impl(args)) as PbQuery<TArgs, TResult>;
  Object.defineProperty(fn, "_pb", {
    value: descriptor,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return fn;
}

// =============================================================================
// Filter encoding — args → PB filter string. Basic, primitive-only.
// =============================================================================

/**
 * Encode a flat args object into a PB filter expression. Supports equality
 * on string / number / boolean fields. Skips `undefined` and `null`.
 *
 * Examples:
 *   { userId: "abc" } → `user = "abc"`
 *   { completed: false, priority: "high" } → `completed = false && priority = "high"`
 *   {} or undefined → ""
 *
 * NOT supported (deferred):
 *   - Operators: >, <, >=, <=, !=, ~ (LIKE)
 *   - Array values (any, all)
 *   - Nested objects (relation traversal)
 *   - Date / time helpers (PB-specific syntax)
 *
 * If a call site needs any of these, extend this function and add a unit
 * test. Keep the encoding deterministic so JSON.stringify(args) can be
 * used as a useEffect dep.
 */
export function encodeArgsAsFilter(
  args: Record<string, unknown> | undefined,
): string {
  if (!args) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      parts.push(`${k} = "${escaped}"`);
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) continue; // skip NaN / Infinity
      parts.push(`${k} = ${v}`);
    } else if (typeof v === "boolean") {
      parts.push(`${k} = ${v}`);
    }
    // Other types (objects, arrays) are silently skipped. Call sites
    // needing them should extend this function.
  }
  return parts.join(" && ");
}

// =============================================================================
// Stable dep key from args — used to re-run the effect on args content change.
// =============================================================================

/**
 * Compute a stable string key from an args object so useEffect can detect
 * content changes (not just reference changes). Uses `encodeArgsAsFilter`
 * which is deterministic over the supported primitive types.
 *
 * For complex args (nested objects, arrays), this is a best-effort key.
 * Stable across re-renders that don't change the args. Good enough for
 * B.2; a structural-equality check can be added later if profiling shows
 * it matters.
 */
export function argsKey(args: Record<string, unknown> | undefined): string {
  return encodeArgsAsFilter(args);
}

// =============================================================================
// useQuery — the reactive read hook.
// =============================================================================

/**
 * Reactive read against a PB collection. The query carries the metadata
 * (collection, kind, match field) on its `_pb` property; this hook reads
 * that, encodes the args, fetches, and subscribes.
 *
 * Returns `T | undefined` to match Convex's useQuery shape. `undefined` is
 * returned:
 *   - On the very first render before the fetch resolves.
 *   - On fetch error (the error is logged; a future iteration may surface
 *     a `{ data, isLoading, error }` shape — see Stream C notes).
 *   - When the result is empty / not found.
 *
 * The subscription is per-call (decision Q3): each useQuery instance opens
 * its own `pb.collection(name).subscribe('*', ...)` channel. Acceptable for
 * single-user desktop; revisit in Phase 6+ if profiling shows it matters.
 */
export function useQuery<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PbQuery<any, T>,
  args?: any,
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  // Stable key for args — re-run the effect when args content changes.
  const key = args === "skip" ? "skip" : argsKey(args);

  useEffect(() => {
    if (args === "skip") return;
    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;
    const client = getPbClient();
    const descriptor = query._pb;

    const fetchAndSet = async () => {
      try {
        const filter = descriptor.buildFilter
          ? descriptor.buildFilter(args)
          : encodeArgsAsFilter(args);
        const collection = client.collection(descriptor.collection);
        let result: T | undefined;

        if (descriptor.kind === "get") {
          const field = descriptor.matchField ?? "id";
          const idValue = args?.[field];
          if (typeof idValue !== "string" || idValue.length === 0) {
            result = undefined;
          } else {
            try {
              result = (await collection.getOne(idValue)) as T;
            } catch (e: unknown) {
              // 404 → undefined (not an error). Everything else logs and
              // also returns undefined (the future `{ data, error }` shape
              // will surface this).
              const err = e as { status?: number };
              if (err?.status !== 404) {
                console.error(
                  `pb-compat: useQuery(${descriptor.collection}, get) failed:`,
                  e,
                );
              }
              result = undefined;
            }
          }
        } else if (descriptor.kind === "list") {
          const list = await collection.getList(1, descriptor.limit ?? 100, {
            filter,
          });
          result = list.items as unknown as T;
        } else {
          // "first" — list with perPage=1, take the head.
          const list = await collection.getList(1, 1, { filter });
          result = (list.items[0] as T) ?? undefined;
        }

        if (!cancelled) {
          setData(result);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(
            `pb-compat: useQuery(${descriptor.collection}, ${descriptor.kind}) failed:`,
            e,
          );
          setData(undefined);
        }
      }
    };

    void fetchAndSet();

    // Subscribe to all changes in the collection. PB doesn't support
    // filter-scoped subscriptions at the protocol level (you can subscribe
    // to a specific record id, but not "any change matching this filter"),
    // so we re-fetch on every change and let the filter decide what
    // matters. The cost is one extra getList per write; for our scale
    // (single-user desktop) that's negligible.
    client
      .collection(descriptor.collection)
      .subscribe("*", () => {
        if (!cancelled) void fetchAndSet();
      })
      .then((unsub) => {
        if (cancelled) {
          // Already unmounted before the subscribe promise resolved.
          void unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch((e) => {
        // Subscribe can fail if the WS can't connect (PB not running).
        // Log once; subsequent retries happen on the next event loop tick
        // when the user does something that triggers a re-render.
        if (!cancelled) {
          console.warn(
            `pb-compat: useQuery(${descriptor.collection}) subscribe failed:`,
            e,
          );
        }
      });

    return () => {
      cancelled = true;
      if (unsubscribe) {
        void unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, query]);

  // When args === "skip", return undefined without touching state. The
  // previous version called setData(undefined) synchronously inside the
  // effect body, which trips react-hooks/set-state-in-effect. The state
  // is preserved (last fetched value) in case args flips back to a real
  // value — semantically equivalent for the consumer.
  return args === "skip" ? undefined : data;
}
