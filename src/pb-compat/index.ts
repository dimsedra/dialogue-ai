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
  type PaginationStatus,
  type UsePaginatedQueryResult,
  type PbAuthState,
  type PbQuery,
  type PbQueryDescriptor,
  type PbQueryKind,
  defineQuery,
  encodeArgsAsFilter,
  argsKey,
  type PbMutationKind,
  type PbMutationDescriptor,
  type PbCreateDescriptor,
  type PbUpdateDescriptor,
  type PbDeleteDescriptor,
  executePbMutation,
  type PbActionDescriptor,
  type PbActionRequest,
  type PbActionResponse,
  executePbAction,
  defineAction,
  type PbPaginatedQuery,
  type PbPaginatedDescriptor,
  definePaginatedQuery,
} from "./hooks";
export { useAuth, PbAuthProvider } from "./auth";
export { getPbClient, resolvePbUrl } from "./client";
export { usePbProfile } from "./hooks/use-pb-profile";
export { usePbWorkspacesList, usePbWorkspace } from "./hooks/use-pb-workspaces";
export { usePbSessionsList, usePbSession } from "./hooks/use-pb-sessions";
export { usePbPersonasList } from "./hooks/use-pb-personas";
export { usePbTasksList, usePbTask, usePbTasksSearchHistory } from "./hooks/use-pb-tasks";
export { usePbEventsList, usePbEvent, usePbEventsSearchHistory } from "./hooks/use-pb-events";
export { usePbHabitsList, usePbHabit, usePbHabitConsistency } from "./hooks/use-pb-habits";
export { usePbMemoriesList } from "./hooks/use-pb-memories";
export { usePbUserImagesList } from "./hooks/use-pb-images";
export { usePbReflection, usePbPublicReflection } from "./hooks/use-pb-reflections";

// Mutations
export { usePbWorkspaceCreate, usePbWorkspaceUpdate } from "./hooks/use-pb-workspace-mutations";
export { usePbPersonaCreate, usePbPersonaUpdate, usePbPersonaDelete } from "./hooks/use-pb-persona-mutations";
export { usePbSessionCreate, usePbSessionDelete, usePbSessionRename, usePbSessionTogglePin } from "./hooks/use-pb-session-mutations";
export { usePbTaskCreate, usePbTaskUpdate, usePbTaskToggleCompleted, usePbTaskDelete, usePbTasksRollOver } from "./hooks/use-pb-task-mutations";
export { usePbEventCreate, usePbEventUpdate, usePbEventDelete, usePbEventCancelOccurrence, usePbEventUpdateOccurrence, usePbEventScheduleFocusBlock } from "./hooks/use-pb-event-mutations";
export { usePbHabitCreate, usePbHabitLog, usePbHabitArchive, usePbHabitDelete } from "./hooks/use-pb-habit-mutations";
export { usePbDismissCard, usePbSnoozeCard, usePbMuteCardType, usePbMarkCardShown } from "./hooks/use-pb-dashboard-mutations";
export { usePbUpdateProfile, usePbUpdatePreferences, usePbAddSubscription, usePbRemoveSubscription } from "./hooks/use-pb-profile-mutations";
export { usePbMemoryCreate, usePbMemoryUpdate, usePbMemoryDelete } from "./hooks/use-pb-memory-mutations";
export { usePbMessageSend } from "./hooks/use-pb-message-mutations";
export { usePbImageSave, usePbImageDelete } from "./hooks/use-pb-image-mutations";
export { usePbReflectionSaveComment, usePbReflectionToggleShare } from "./hooks/use-pb-reflection-mutations";

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
// Pagination helpers (used by usePaginatedQuery; exposed for tests + any
// consumer that needs to mutate paginated state directly).
// =============================================================================

export {
  type PbItem,
  type PbSubscribeEvent,
  type PbCursor,
  encodeCursor,
  decodeCursor,
  appendOlderPage,
  prependNewItem,
  removeItemById,
  findPageOfItem,
  mergeRefetchedPage,
  handleCreateEvent,
  handleDeleteEvent,
  buildPageFilter,
} from "./pagination";

// =============================================================================
// Feature-flag check. Single source of truth for "is the PB backend active".
//
// Phase 1: always returns false. Phase 2 enables the flag for the feature-flag
// rollout (Phase 3 per migration plan §5).
// =============================================================================

export function isPbBackend(): boolean {
  // Reads NEXT_PUBLIC_BACKEND. Defaults to false (Convex).
  // Set NEXT_PUBLIC_BACKEND=pocketbase to opt into the PB adapter.
  // This is the single switch the Phase 3 rollout (per migration plan §5)
  // uses to flip consumers one at a time.
  return process.env.NEXT_PUBLIC_BACKEND === "pocketbase";
}

// =============================================================================
// Phase status. Used by tests and the migration doc to verify the surface.
//
// Phase 2 is in progress as of B.5a: hooks B.1 (useAuth), B.2 (useQuery),
// B.3 (useMutation), B.4 (useAction), B.5a (usePaginatedQuery) are real.
// The `isPbBackend` flag is wired but defaults to false. The first consumer
// call behind the flag lands in B.7.
// =============================================================================

export const PB_COMPAT_PHASE = 2 as const;
export const PB_COMPAT_STATUS = "in-progress" as const;
