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
// useAction — for server-side / non-CRUD actions (e.g. parseDate, embeddings).
//
// Phase 1: stub threw on call.
// Phase 2 Stage B.4: the real implementation lives in `./use-action.ts`.
// POSTs args to /api/pb-action/<name> and returns the parsed result.
// The route dispatcher resolves the name to a registered handler and runs
// it with the user context (from the Bearer token). The dispatcher + auth
// helper + action registry live under `src/lib/pb-actions/`.
// =============================================================================

export { useAction, executePbAction, defineAction } from "./use-action";
export type {
  PbActionDescriptor,
  PbActionRequest,
  PbActionResponse,
} from "./use-action";

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
//   - "Load more": `getList(1, N, { filter: baseFilter + "&& id < cursor",
//     sort: "-id" })`.
//   - Cursor: base64url({ lastId, pageSize }), encoded/decode in pagination.ts.
//   - Real-time: `pb.collection(name).subscribe("*", cb)`. New items prepend
//     if newer than our newest; updates refetch the page; deletes remove.
//
// Phase 1: threw on call. Shape defined; behaviour missing.
// Phase 2 Stage B.5: real implementation in `./use-paginated-query.ts`.
//   Throws if called when isPbBackend() is false (feature flag).
//   Returns { results: [], status: "Exhausted", loadMore: noop } for "skip".
//   State machine matches Convex exactly: LoadingFirstPage | CanLoadMore |
//   Exhausted. 10K-item integration test (B.5b) is the real validation —
//   the helpers are unit-tested in pagination.test.ts.
// =============================================================================

export {
  usePaginatedQuery,
  definePaginatedQuery,
  type PbPaginatedQuery,
  type PbPaginatedDescriptor,
  type UsePaginatedQueryResult,
  type PaginationStatus,
} from "./use-paginated-query";

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
// usePbProfile — Convex-shaped wrapper around the PB userProfile.get
// descriptor. B.7.3: the first read-path call behind the
// NEXT_PUBLIC_BACKEND flag. Reads the current user from useAuth(),
// fetches via the PB user_profile collection, and maps the PB shape
// to Convex's Doc<"userProfile"> so the existing consumer code
// (profile._id, profile.userId, profile.preferences.*) stays
// unchanged across the flag.
//
// Real implementation lives in `./hooks/use-pb-profile.ts`.
// =============================================================================

export { usePbProfile } from "./hooks/use-pb-profile";
export { usePbWorkspacesList, usePbWorkspace } from "./hooks/use-pb-workspaces";
export { usePbSessionsList, usePbSession } from "./hooks/use-pb-sessions";
export { usePbPersonasList } from "./hooks/use-pb-personas";
export { usePbTasksList, usePbTask, usePbTasksSearchHistory } from "./hooks/use-pb-tasks";
export { usePbEventsList, usePbEvent, usePbEventsSearchHistory } from "./hooks/use-pb-events";
export { usePbHabitsList, usePbHabit, usePbHabitConsistency } from "./hooks/use-pb-habits";
export { usePbMemoriesList } from "./hooks/use-pb-memories";
export { usePbUserImagesList } from "./hooks/use-pb-images";

// Mutations
export { usePbWorkspaceCreate, usePbWorkspaceUpdate, usePbWorkspaceDelete } from "./hooks/use-pb-workspace-mutations";
export { usePbPersonaCreate, usePbPersonaUpdate, usePbPersonaDelete } from "./hooks/use-pb-persona-mutations";
export { usePbSessionCreate, usePbSessionDelete, usePbSessionRename, usePbSessionTogglePin } from "./hooks/use-pb-session-mutations";
export { usePbTaskCreate, usePbTaskUpdate, usePbTaskToggleCompleted, usePbTaskDelete, usePbTasksRollOver } from "./hooks/use-pb-task-mutations";
export { usePbEventCreate, usePbEventUpdate, usePbEventDelete, usePbEventCancelOccurrence, usePbEventUpdateOccurrence, usePbEventScheduleFocusBlock } from "./hooks/use-pb-event-mutations";
export { usePbHabitCreate, usePbHabitLog, usePbHabitArchive, usePbHabitDelete } from "./hooks/use-pb-habit-mutations";
export { usePbDismissCard, usePbSnoozeCard, usePbMuteCardType, usePbMarkCardShown } from "./hooks/use-pb-dashboard-mutations";
export { usePbUpdateProfile, usePbUpdatePreferences, usePbAddSubscription, usePbRemoveSubscription } from "./hooks/use-pb-profile-mutations";
export { usePbMemoryCreate, usePbMemoryUpdate, usePbMemoryDelete } from "./hooks/use-pb-memory-mutations";
export { usePbMessageSend, usePbMessageUpdate } from "./hooks/use-pb-message-mutations";
export { usePbImageSave, usePbImageDelete } from "./hooks/use-pb-image-mutations";

// =============================================================================
// Re-exports for convenience.
// =============================================================================

export type { PbId, PbCollectionName, PbRecord, PbRecordMap };
