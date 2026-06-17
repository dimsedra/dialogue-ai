// usePaginatedQuery — Phase 2 Stage B.5a.
//
// What this does:
//   - Loads items in pages, oldest-loaded is tracked by an opaque cursor.
//   - Sort is fixed: by id descending (newest first). PB ids are
//     time-prefixed so lexicographic order = chronological order.
//   - On mount: fetches the first page + subscribes to changes.
//   - loadMore(n): fetches the next page (items with id < cursor's
//     lastId), appends to results.
//   - On 'create' event: prepends the new item if it's newer than the
//     newest loaded item (browser CSS overflow-anchor keeps scroll stable).
//   - On 'update' event: refetches the page that contains the item.
//   - On 'delete' event: removes the item from results.
//
// What this deliberately does NOT do:
//   - Optimistic updates on edits. The refetch is awaited.
//   - Cursor persistence across page reloads. The cursor is in-memory
//     only. (Post-freeze: serialize to URL hash if needed.)
//   - Filter-args reactivity beyond JSON-key equality. The consumer
//     is expected to keep args objects stable (or accept the re-fetch
//     on identity change).
//   - "LoadingMore" status. Matches Convex's 3-state machine exactly.
//
// Consumer note: add `style={{ overflowAnchor: "auto" }}` to the scrollable
// list container so the browser keeps the user's scroll position stable
// when new items are prepended.

import { useCallback, useEffect, useRef, useState } from "react";
import PocketBase from "pocketbase";
import { getPbClient } from "./client";
import { isPbBackend } from "./index";
import {
  appendOlderPage,
  buildPageFilter,
  findPageOfItem,
  handleCreateEvent,
  handleDeleteEvent,
  mergeRefetchedPage,
  type PbItem,
  type PbSubscribeEvent,
  type PaginationStatus,
} from "./pagination";
import { ensureIdProperties } from "./use-query";

export type { PaginationStatus } from "./pagination";

// =============================================================================
// Descriptor + query function. The query function carries the _pb metadata
// (collection + filter builder) so the hook can be called with a plain
// function reference, matching the useQuery pattern.
// =============================================================================

export interface PbPaginatedDescriptor<TArgs> {
  collection: string;
  buildFilter: (args: TArgs) => string;
}

export interface PbPaginatedQuery<TArgs> {
  (...args: never[]): Promise<unknown>;
  _pb: PbPaginatedDescriptor<TArgs>;
}

export function definePaginatedQuery<TArgs>(
  descriptor: PbPaginatedDescriptor<TArgs>,
): PbPaginatedQuery<TArgs> {
  const fn = (async () => {
    throw new Error(
      "pb-compat: paginated query should not be called directly. " +
        "Use usePaginatedQuery.",
    );
  }) as unknown as PbPaginatedQuery<TArgs>;
  fn._pb = descriptor;
  return fn;
}

// =============================================================================
// The hook.
//
// Rules of Hooks: all hook calls happen unconditionally and in the same
// order on every render. The "skip" branch is a short-circuit INSIDE the
// effect + loadMore, not an early return. The isPbBackend() throw is at
// the top of the function so the throw path is consistent across renders.
// =============================================================================

export interface UsePaginatedQueryResult<T> {
  results: T[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
}

export function usePaginatedQuery<
  TArgs extends Record<string, unknown>,
  TResult extends PbItem,
>(
  query: PbPaginatedQuery<TArgs>,
  args: TArgs | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryResult<TResult> {
  // Feature-flag guard. Env var is build-time so this throw path is
  // consistent across renders for a given build.
  if (!isPbBackend()) {
    throw new Error(
      "pb-compat: usePaginatedQuery called when isPbBackend() is false. " +
        "Gate the consumer on isPbBackend() (or default to Convex).",
    );
  }

  const isSkip = args === "skip";
  const realArgs = isSkip ? null : args;
  const { collection, buildFilter } = query._pb;
  const baseFilter = realArgs ? buildFilter(realArgs) : "";
  // Stable key for args so the effect doesn't re-run on every render.
  // "skip" gets a sentinel key; we never reach the effect's fetch path
  // when isSkip is true.
  const argsKey = isSkip ? "__skip__" : JSON.stringify(realArgs);

  // ---- Hooks below this line. Same order on every render. ----

  const [rawResults, setRawResults] = useState<TResult[]>([]);
  const [status, setStatus] = useState<PaginationStatus>(
    isSkip ? "Exhausted" : "LoadingFirstPage",
  );
  const [lastKey, setLastKey] = useState<string | null>(null);

  if (argsKey !== lastKey) {
    setLastKey(argsKey);
    setRawResults([]);
    setStatus(isSkip ? "Exhausted" : "LoadingFirstPage");
  }

  const setResults = (updater: TResult[] | ((prev: TResult[]) => TResult[])) => {
    setRawResults((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return ensureIdProperties(next);
    });
  };
  const results = rawResults;
  // Refs for values that change but shouldn't trigger re-render or
  // re-subscribe. Read at call time inside the subscribe callback.
  const lastIdRef = useRef<string | null>(null);
  const pageSizeRef = useRef<number>(options.initialNumItems);

  // Stable fetchPage, depends on collection + the built filter string.
  const fetchPage = useCallback(
    async (
      pb: PocketBase,
      pageSize: number,
      afterId: string | null,
    ): Promise<{ items: TResult[]; isDone: boolean }> => {
      const filterString = buildPageFilter(baseFilter, afterId);
      const result = await pb.collection(collection).getList(1, pageSize, {
        sort: "-id",
        filter: filterString || undefined,
        requestKey: null,
      });
      const items = result.items as unknown as TResult[];
      return {
        items,
        // PB's getList returns fewer items than perPage when exhausted.
        isDone: items.length < pageSize,
      };
    },
    [collection, baseFilter],
  );

  // Initial fetch + subscribe. Re-runs when collection or args change.
  useEffect(() => {
    // Skip path: nothing to load, nothing to subscribe to.
    if (isSkip) return;

    // Immediately reset to prevent stale results from a previous
    // args set (e.g. previous session) from lingering during the
    // async fetch below.
    setResults([]);
    setStatus("LoadingFirstPage");
    lastIdRef.current = null;

    const pb = getPbClient();
    let cancelled = false;
    let unsub: (() => void) | null = null;

    // Initial fetch.
    (async () => {
      try {
        const { items, isDone } = await fetchPage(
          pb,
          pageSizeRef.current,
          null,
        );
        if (cancelled) return;
        setResults(items);
        lastIdRef.current = items[items.length - 1]?.id ?? null;
        setStatus(isDone ? "Exhausted" : "CanLoadMore");
      } catch (err) {
        if (!cancelled) {
          console.error(
            "pb-compat: usePaginatedQuery initial fetch failed:",
            err,
          );
        }
      }
    })();

    // Subscribe to changes. Re-subscribes when collection/args change.
    // The SDK types the callback's `action` as `string` and `record` as
    // the generic `RecordModel`; we narrow the action to the literal
    // union and trust the caller-provided TResult shape.
    pb.collection(collection)
      .subscribe("*", (event) => {
        if (cancelled) return;
        const action = event.action as PbSubscribeEvent<TResult>["action"];
        const record = event.record as unknown as TResult;
        if (action === "create") {
          setResults((prev) => handleCreateEvent(prev, record));
        } else if (action === "delete") {
          setResults((prev) => handleDeleteEvent(prev, record.id));
        } else if (action === "update") {
          // Find the page; refetch asynchronously. We use a state callback
          // to read the latest results without re-subscribing.
          setResults((prev) => {
            const page = findPageOfItem(
              prev,
              record.id,
              pageSizeRef.current,
            );
            if (!page) return prev;
            const afterId =
              page.pageStart === 0
                ? null
                : (prev[page.pageStart - 1]?.id ?? null);
            (async () => {
              try {
                const { items } = await fetchPage(
                  pb,
                  pageSizeRef.current,
                  afterId,
                );
                if (cancelled) return;
                setResults((current) =>
                  mergeRefetchedPage(current, items, page.pageStart),
                );
              } catch (err) {
                console.error(
                  "pb-compat: usePaginatedQuery refetch on update failed:",
                  err,
                );
              }
            })();
            return prev; // Don't optimistically change; wait for refetch.
          });
        }
      })
      .then((u) => {
        if (cancelled) {
          u();
        } else {
          unsub = u;
        }
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [collection, argsKey, isSkip, fetchPage]);

  const loadMore = useCallback(
    (numItems: number) => {
      if (isSkip) return;
      // Guard: only load if we have a next page.
      // We read status via a functional update to avoid stale closure.
      setStatus((current) => {
        if (current !== "CanLoadMore") return current;
        const pb = getPbClient();
        pageSizeRef.current = numItems;
        (async () => {
          try {
            const { items, isDone } = await fetchPage(
              pb,
              numItems,
              lastIdRef.current,
            );
            if (items.length === 0) {
              setStatus("Exhausted");
              return;
            }
            setResults((prev) => appendOlderPage(prev, items));
            lastIdRef.current =
              items[items.length - 1]?.id ?? lastIdRef.current;
            setStatus(isDone ? "Exhausted" : "CanLoadMore");
          } catch (err) {
            console.error("pb-compat: usePaginatedQuery loadMore failed:", err);
            setStatus("CanLoadMore");
          }
        })();
        return current; // Status stays "CanLoadMore" during load
      });
    },
    [isSkip, fetchPage],
  );

  return { results, status, loadMore };
}
