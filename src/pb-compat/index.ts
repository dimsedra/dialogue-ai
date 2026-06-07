// PocketBase adapter public surface — Phase 1.
//
// This module is the entry point that the app code will eventually import from.
// It is GATED by `NEXT_PUBLIC_BACKEND`: if the env var is not "pb", the
// runtime hooks throw with a clear message. If it is "pb", the same hooks
// throw with a "Phase 1 stub" message.
//
// What this module provides:
//   - `api`: the typed API namespace (Phase 1: stub object, throws on call)
//   - `useQuery`, `useMutation`, `useAction`, `usePaginatedQuery`, `useAuth`:
//     the React hook surface (Phase 1: all throw)
//   - `isPbBackend()`: feature-flag check
//   - Type re-exports: `PbId`, `PbRecord`, `PbRecordMap`, `PbCollectionName`,
//     `PbResource`, `PaginationStatus`, `UsePaginatedQueryResult`, `PbAuthState`
//
// What this module does NOT do (Phase 1):
//   - No PB client construction. Phase 2 adds `getPbClient()`.
//   - No real React hooks. Phase 2 wires them to PB's reactive subscriptions.
//   - No data migration. Phase 4 handles the cutover.

export { api, type PbApiType, type PbIdArg, type PbRecordArg } from "./api";
export {
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
  useAuth,
  type PaginationStatus,
  type UsePaginatedQueryResult,
  type PbAuthState,
} from "./hooks";

export type {
  PbId,
  PbRecord,
  PbRecordMap,
  PbCollectionName,
  PbResource,
} from "./_generated/dataModel";

export {
  pbId,
  type PbUsers,
  type PbAgentPersonas,
  type PbWorkspaces,
  type PbChatSessions,
  type PbMessages,
  type PbTasks,
  type PbUserProfile,
  type PbMemories,
  type PbEvents,
  type PbReflections,
  type PbUserImages,
  type PbHabits,
  type PbHabitLogs,
  type PbPageSettings,
  type PbSessionSummaries,
  type PbWeeklyDigests,
  type PbArchivedSummaries,
  type PbNotifications,
  type PbPushSubscriptions,
  type PbCardState,
  type PbScheduledNotifications,
} from "./_generated/dataModel";

// =============================================================================
// Feature-flag check. Single source of truth for "is the PB backend active".
//
// Phase 1: always returns false. Phase 2 enables the flag for the feature-flag
// rollout (Phase 3 per migration plan §5).
// =============================================================================

export function isPbBackend(): boolean {
  // In Phase 1, this is intentionally always false. The Phase 2 work item
  // explicitly decides when to flip the default.
  return false;
}

// =============================================================================
// Phase status. Used by tests and the migration doc to verify the surface.
// =============================================================================

export const PB_COMPAT_PHASE = 1 as const;
export const PB_COMPAT_STATUS = "stub" as const;
