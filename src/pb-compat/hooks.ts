// PocketBase hook surface — Phase 1 stub.
//
// What this file does:
//   - Defines the SHAPE of `useAction` and `usePaginatedQuery` (and the rest of
//     the Convex hook surface) that the pb-compat adapter will eventually back.
//   - Every hook is a stub that throws if called. They are NOT registered with
//     React (no useState, no useEffect, nothing reactive).
//   - Phase 2 will wire these to PB's reactive subscription model.
//
// Why define the shape now?
//   - The signature is the contract. Once we commit to it, Phase 2 must satisfy
//     it or break loudly. TypeScript is the safety net.
//   - Lets us write the type-level test (convex/pb-compat-types.test.ts) today
//     and catch signature drift before Phase 2 lands.
//
// What Phase 1 deliberately does NOT include:
//   - `useQuery` / `useMutation` (replaced by Phase 2's reactive hooks
//     wrapping `pb.collection(...).subscribe('*', ...)`)
//   - Real implementations of any kind
//   - React imports (this file should compile without React)

import type { PbId, PbCollectionName, PbRecord, PbRecordMap } from "./_generated/dataModel";

// =============================================================================
// useQuery — generic reactive read against a PB collection.
//
// Phase 1: stub threw on call.
// Phase 2 Stage B.2: the real implementation lives in `./use-query.ts`. It
// reads the `_pb` metadata attached to the query function, encodes args
// into a PB filter, fetches via the SDK, and subscribes to changes. This
// file re-exports the symbol from there.
// =============================================================================

export { useQuery } from "./use-query";
export type { PbQuery, PbQueryDescriptor, PbQueryKind } from "./use-query";
export { defineQuery, encodeArgsAsFilter, argsKey } from "./use-query";

// =============================================================================
// useMutation — generic write against a PB collection.
//
// Phase 1: stub threw on call.
// Phase 2 Stage B.3: the real implementation lives in `./use-mutation.ts`.
// Three overloads (create/update/delete) narrow the args and return types
// per discriminator. No optimistic updates (deferred to post-freeze per
// ADR-011). No reactive subscription — writes are fire-and-forget; PB's
// realtime channel pushes the result to the matching useQuery.
// =============================================================================

export { useMutation } from "./use-mutation";
export type {
  PbMutationKind,
  PbMutationDescriptor,
  PbCreateDescriptor,
  PbUpdateDescriptor,
  PbDeleteDescriptor,
} from "./use-mutation";
export { executePbMutation } from "./use-mutation";

// =============================================================================
// useAction — for server-side / non-CRUD actions (e.g. embeddings, parsing).
//
// Phase 1: throws.
// Phase 2: wraps a Next.js API route that internally calls PB (no more Convex
//   actions). The args/result shapes mirror Convex's action signatures so
//   consumer code doesn't need to change.
// =============================================================================

export function useAction<TArgs extends Record<string, unknown>, TResult = unknown>(
  _action: unknown,
): (args: TArgs) => Promise<TResult> {
  throw new Error(
    "pb-compat: useAction is a Phase 1 stub. " +
      "It is not yet implemented against PocketBase. " +
      "Set NEXT_PUBLIC_BACKEND=convex (default) or wait for Phase 2.",
  );
}

// =============================================================================
// usePaginatedQuery — highest-risk item in Phase 1 (per migration plan §5 Phase 1).
//
// Convex semantics:
//   - Initial load: returns the first N items + a status flag.
//   - "Load more": returns the next N items, status transitions to "CanLoadMore"
//     or "Exhausted".
//   - Cursor: an opaque string Convex generates.
//
// PB equivalent:
//   - First page: `pb.collection(name).getList(1, N, { filter, sort })`.
//   - "Load more": `getList(page + 1, N, { filter, sort })`.
//   - Cursor: derived from the last record's sort field. Phase 2 will define
//     a stable cursor format (e.g. base64-encoded JSON of the sort key).
//
// Phase 1: throws. The shape is defined; the behaviour is not.
// =============================================================================

export type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "Exhausted";

export interface UsePaginatedQueryResult<T> {
  results: T[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
}

export function usePaginatedQuery<T>(
  _query: unknown,
  _args: Record<string, unknown>,
  _options: { initialNumItems: number },
): UsePaginatedQueryResult<T> {
  throw new Error(
    "pb-compat: usePaginatedQuery is a Phase 1 stub. " +
      "It is not yet implemented against PocketBase. " +
      "This is the highest-risk item of the migration; see " +
      "docs/MIGRATION_POCKETBASE.md §5 Phase 1 and §5 Phase 5.",
  );
}

// =============================================================================
// useAuth — wraps PB's `authStore` (replaces `@convex-dev/auth`'s `useAuth`).
//
// Phase 1: stub threw on call.
// Phase 2 Stage B.1: the real implementation lives in `./auth.tsx`. The
// `PbAuthState` type stays here so consumers can import the type without
// pulling in React. The `useAuth` symbol is re-exported from `./auth.tsx`
// via `index.ts`.
// =============================================================================

export interface PbAuthState {
  user: PbRecord | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, passwordConfirm: string) => Promise<void>;
}

// =============================================================================
// Re-exports for convenience.
// =============================================================================

export type { PbId, PbCollectionName, PbRecord, PbRecordMap };
