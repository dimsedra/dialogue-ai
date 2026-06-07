// Pagination helpers — pure functions for cursor encoding, page merging,
// and item lookups. No React, no PocketBase. Easy to test in isolation.
//
// Design notes (per the B.5 plan, locked in):
//   - Cursor is opaque base64 of { lastId, pageSize }.
//   - Items are sorted by id descending (newest first). PB ids are
//     time-prefixed so lexicographic order = chronological order.
//   - On loadMore: get items with id < lastId, append to existing.
//   - On 'create' event: prepend if id > newest loaded id.
//   - On 'update' event: refetch the page that contains the item.
//   - On 'delete' event: remove from results.

export interface PbCursor {
  /** id of the OLDEST item we've loaded. Used to fetch older items next. */
  lastId: string;
  /** Page size used in the last fetch. */
  pageSize: number;
}

export interface PbItem {
  id: string;
}

export type PaginationStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "Exhausted";

// =============================================================================
// Cursor encode / decode. Base64url for URL-safety. Validates shape on decode.
// =============================================================================

export function encodeCursor(cursor: PbCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

export function decodeCursor(s: string): PbCursor {
  let json: string;
  try {
    json = Buffer.from(s, "base64url").toString("utf-8");
  } catch {
    throw new Error("pb-compat: cursor is not valid base64url");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("pb-compat: cursor is not valid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as PbCursor).lastId !== "string" ||
    typeof (parsed as PbCursor).pageSize !== "number"
  ) {
    throw new Error("pb-compat: cursor has invalid shape");
  }
  return parsed as PbCursor;
}

// =============================================================================
// Page lookups + mutations. All pure, all return new arrays.
// =============================================================================

/** Append older items to existing results. Used by loadMore. */
export function appendOlderPage<T extends PbItem>(
  existing: T[],
  newPage: T[],
): T[] {
  return [...existing, ...newPage];
}

/** Prepend a newly-arrived item to results. Used on 'create' subscribe event. */
export function prependNewItem<T extends PbItem>(results: T[], newItem: T): T[] {
  return [newItem, ...results];
}

/** Remove an item by id. Used on 'delete' subscribe event. */
export function removeItemById<T extends PbItem>(results: T[], id: string): T[] {
  return results.filter((r) => r.id !== id);
}

/** Find the page-slot a given id is in, given a page size. */
export function findPageOfItem<T extends PbItem>(
  results: T[],
  id: string,
  pageSize: number,
): { pageStart: number; pageIndex: number } | null {
  if (pageSize <= 0) return null;
  const idx = results.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  return {
    pageStart: Math.floor(idx / pageSize) * pageSize,
    pageIndex: idx,
  };
}

/**
 * Merge a freshly-refetched page into existing results at the given
 * page-start position. The refetched page may be shorter than the
 * original (e.g., an item was deleted); we only replace positions
 * that exist in the refetch.
 */
export function mergeRefetchedPage<T extends PbItem>(
  existing: T[],
  refetchedPage: T[],
  pageStart: number,
): T[] {
  const next = [...existing];
  for (let i = 0; i < refetchedPage.length; i++) {
    next[pageStart + i] = refetchedPage[i];
  }
  return next;
}

// =============================================================================
// Subscribe-event handlers. Each takes the current results and a PB event,
// returns a new results array. Pure, no side effects.
// =============================================================================

export interface PbSubscribeEvent<T extends PbItem> {
  action: "create" | "update" | "delete";
  record: T;
}

/**
 * Handle a 'create' subscribe event: prepend the new item if it's newer
 * than our newest loaded item. Items older than our newest are ignored
 * (they'll show up on the next loadMore).
 */
export function handleCreateEvent<T extends PbItem>(
  results: T[],
  newItem: T,
): T[] {
  const newestId = results[0]?.id;
  if (newestId && newItem.id <= newestId) {
    return results;
  }
  return prependNewItem(results, newItem);
}

/** Handle a 'delete' subscribe event: remove the item if present. */
export function handleDeleteEvent<T extends PbItem>(
  results: T[],
  deletedId: string,
): T[] {
  if (!results.some((r) => r.id === deletedId)) {
    return results;
  }
  return removeItemById(results, deletedId);
}

// =============================================================================
// Filter helpers.
// =============================================================================

/**
 * Build the PB filter string for a page fetch.
 * - baseFilter is what the caller defines (e.g. `sessionId = "abc"`).
 * - afterId is the cursor's lastId; we add `id < "afterId"` to get older items.
 * Returns the merged filter string (empty string means "no filter").
 */
export function buildPageFilter(baseFilter: string, afterId: string | null): string {
  if (!baseFilter && !afterId) return "";
  if (!afterId) return baseFilter;
  const cursorPart = `id < "${afterId}"`;
  if (!baseFilter) return cursorPart;
  return `${baseFilter} && ${cursorPart}`;
}
