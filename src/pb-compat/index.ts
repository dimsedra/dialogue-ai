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
export { pageSettingsGetQuery } from "./descriptors/pageSettings";
export { usePbWorkspacesList, usePbWorkspace } from "./hooks/use-pb-workspaces";
export { usePbSessionsList, usePbSession } from "./hooks/use-pb-sessions";

export { usePbTasksList, usePbTask, usePbTasksSearchHistory } from "./hooks/use-pb-tasks";
export { usePbEventsList, usePbEvent, usePbEventsSearchHistory } from "./hooks/use-pb-events";
export { usePbHabitsList, usePbHabit, usePbHabitConsistency } from "./hooks/use-pb-habits";
export { usePbMemoriesList } from "./hooks/use-pb-memories";
export { usePbMessagesPaginated } from "./hooks/use-pb-messages";
export { usePbUserImagesList } from "./hooks/use-pb-images";

// Mutations
export { usePbWorkspaceCreate, usePbWorkspaceUpdate, usePbWorkspaceDelete } from "./hooks/use-pb-workspace-mutations";

export { usePbSessionCreate, usePbSessionDelete, usePbSessionRename, usePbSessionTogglePin, usePbSessionMerge } from "./hooks/use-pb-session-mutations";
export { usePbTaskCreate, usePbTaskUpdate, usePbTaskToggleCompleted, usePbTaskDelete, usePbTasksRollOver } from "./hooks/use-pb-task-mutations";
export { usePbEventCreate, usePbEventUpdate, usePbEventDelete, usePbEventCancelOccurrence, usePbEventUpdateOccurrence, usePbEventScheduleFocusBlock } from "./hooks/use-pb-event-mutations";
export { usePbHabitCreate, usePbHabitUpdate, usePbHabitLog, usePbHabitArchive, usePbHabitDelete } from "./hooks/use-pb-habit-mutations";
export { usePbDismissCard, usePbSnoozeCard, usePbMuteCardType, usePbMarkCardShown } from "./hooks/use-pb-dashboard-mutations";
export { usePbUpdateProfile, usePbUpdatePreferences, usePbAddSubscription, usePbRemoveSubscription } from "./hooks/use-pb-profile-mutations";
export { usePbMemoryCreate, usePbMemoryUpdate, usePbMemoryDelete } from "./hooks/use-pb-memory-mutations";
export { usePbMessageSend, usePbMessageUpdate } from "./hooks/use-pb-message-mutations";
export { usePbImageSave, usePbImageDelete } from "./hooks/use-pb-image-mutations";

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

  type PbWorkspaces,
  type PbChatSessions,
  type PbMessages,
  type PbTasks,
  type PbUserProfile,
  type PbMemories,
  type PbEvents,
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

export { isPbBackend, PB_COMPAT_PHASE, PB_COMPAT_STATUS } from "./env";
