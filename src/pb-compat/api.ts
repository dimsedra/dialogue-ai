// PocketBase API surface — Phase 1 stub.
//
// What this file does:
//   - Defines a typed `api` shape that mirrors the Convex `api` namespace.
//   - Every function is a runtime stub that throws if called.
//   - Phase 2 will replace the body of each function with a real PB-backed
//     implementation. The TYPES stay; the BEHAVIOUR comes.
//
// Why a stub instead of nothing?
//   - The app can `import { api } from "pb-compat/api"` and have the import
//     type-check against the Convex `api` shape today. The runtime is a no-op
//     until Phase 2 wires it up.
//   - Feature-flag switching (`NEXT_PUBLIC_BACKEND=pb` vs `=convex`) is a
//     Phase 3 concern, but the surface needs to exist before then.
//
// How to use (in Phase 3+):
//   import { api } from "pb-compat/api";
//   const user = await api.users.currentUser({});
//   (throws today; will work in Phase 2+)
//
// How to call something that doesn't throw today:
//   import { isPbBackend } from "pb-compat";
//   if (!isPbBackend()) {
//     // use the real Convex api
//   } else {
//     // use pb-compat/api (will throw until Phase 2)
//   }

import type { PbCollectionName, PbId, PbRecord } from "./_generated/dataModel";
import { userProfileGetQuery } from "./descriptors/userProfile";
import { workspacesListQuery, workspacesGetQuery } from "./descriptors/workspaces";
import { personasListQuery } from "./descriptors/personas";
import { listSessionsQuery, getSessionQuery } from "./descriptors/chatSessions";
import { tasksListQuery, tasksGetQuery, tasksSearchHistoryQuery } from "./descriptors/tasks";
import { eventsListQuery, eventsGetQuery, eventsSearchHistoryQuery } from "./descriptors/events";
import { habitsListRawQuery, habitsGetQuery, habitsGetHabitConsistencyQuery } from "./descriptors/habits";
import {
  getAttentionNeededQuery,
  getReflectionReadyQuery,
  getTaskTriageQuery,
  getMorningBriefQuery,
  getEventPrepQuery,
  getHabitCheckQuery,
  getEveningLogQuery,
  getMutedCardStatesQuery,
} from "./descriptors/dashboard";

// =============================================================================
// Stub function type. Every API call returns a promise that rejects.
// =============================================================================

type StubArgs = Record<string, unknown>;

type StubFn<TArgs extends StubArgs = StubArgs, TResult = unknown> = (
  args: TArgs,
) => Promise<TResult>;

type StubNamespace<TArgs extends StubArgs = StubArgs, TResult = unknown> = Record<
  string,
  StubFn<TArgs, TResult>
>;

// The full API surface. Each top-level key is a Convex `api.*` namespace; each
// inner key is a function. Phase 2 will replace this with real, PB-backed
// implementations behind the same shape.
//
// Coverage matrix (Phase 1):
//   ✅ all top-level Convex namespaces represented as empty stubs
//   ✅ typed signature takes a `StubArgs` object (matches Convex convention)
//   ❌ per-function argument types and return types — Phase 2
//
// Stable, well-typed surface comes in Phase 2 when we wire the adapter.
export const api = {
  // Core data namespaces
  users: {} as StubNamespace,
  workspaces: {
    list: workspacesListQuery,
    get: workspacesGetQuery,
  },
  chatSessions: {} as StubNamespace,
  agentPersonas: {
    list: personasListQuery,
  },
  messages: {
    listSessions: listSessionsQuery,
    getSession: getSessionQuery,
  },
  tasks: {
    list: tasksListQuery,
    get: tasksGetQuery,
    searchHistory: tasksSearchHistoryQuery,
  },
  // B.7.2: userProfile.get is the first real (non-stub) PB descriptor.
  // The rest of userProfile.* is still a stub — only `get` is wired.
  userProfile: { get: userProfileGetQuery },
  memories: {} as StubNamespace,
  events: {
    list: eventsListQuery,
    get: eventsGetQuery,
    searchHistory: eventsSearchHistoryQuery,
  },
  reflections: {} as StubNamespace,
  userImages: {} as StubNamespace,
  habits: {
    getHabits: habitsListRawQuery,
    get: habitsGetQuery,
    getHabitConsistency: habitsGetHabitConsistencyQuery,
  },
  habitLogs: {} as StubNamespace,
  pageSettings: {} as StubNamespace,
  sessionSummaries: {} as StubNamespace,
  weeklyDigests: {} as StubNamespace,
  archivedSummaries: {} as StubNamespace,
  notifications: {} as StubNamespace,
  pushSubscriptions: {} as StubNamespace,
  cardState: {} as StubNamespace,
  dashboard: {
    getAttentionNeeded: getAttentionNeededQuery,
    getReflectionReady: getReflectionReadyQuery,
    getTaskTriage: getTaskTriageQuery,
    getMorningBrief: getMorningBriefQuery,
    getEventPrep: getEventPrepQuery,
    getHabitCheck: getHabitCheckQuery,
    getEveningLog: getEveningLogQuery,
    getMutedCardStates: getMutedCardStatesQuery,
  },

  // Auth
  auth: {} as StubNamespace,

  // System
  migrations: {} as StubNamespace,
  ocean: {} as StubNamespace,
  oceanQueries: {} as StubNamespace,
  encryption: {} as StubNamespace,
  aiProviders: {} as StubNamespace,
  ai: {} as StubNamespace,
  backgroundJobs: {} as StubNamespace,
  weeklyDigestsJobs: {} as StubNamespace,
  reflectionsJobs: {} as StubNamespace,

  // Cron / scheduled
  crons: {} as StubNamespace,
} as const;

// =============================================================================
// Helper: runtime assertion that this stub was called unintentionally.
// =============================================================================

const stubError = (namespace: string, fn: string): never => {
  throw new Error(
    `pb-compat: api.${namespace}.${fn}() is a Phase 1 stub. ` +
      `It is not yet implemented against PocketBase. ` +
      `Either set NEXT_PUBLIC_BACKEND=convex (default), ` +
      `or wait for Phase 2 of the migration.`,
  );
};

// =============================================================================
// Proxy that wraps every property access in a stub function. This is what
// throws if the app accidentally calls a stub.
// =============================================================================

const makeStub = <T extends Record<string, unknown>>(namespace: string): T =>
  new Proxy({} as T, {
    get: (_target, prop) => {
      if (
        typeof prop === "symbol" ||
        prop === "then" || // Promise resolution
        prop === "toJSON" ||
        prop === "toString" ||
        prop === "valueOf"
      ) {
        return undefined;
      }
      return (_args: StubArgs) => stubError(namespace, String(prop));
    },
  });

// Freeze the api object so it can't be mutated at runtime. Phase 2 will
// replace this whole file with a real implementation; consumers import the
// same name (`api`) and get the new behaviour transparently.
Object.freeze(api);

// =============================================================================
// Type aliases. Used by hooks.ts and the public index.ts.
// =============================================================================

export type PbApiType = typeof api;
export type PbIdArg<T extends PbCollectionName> = { id: PbId<T> };
export type PbRecordArg<T extends PbCollectionName> = { record: PbRecord };
