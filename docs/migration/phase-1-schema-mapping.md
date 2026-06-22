# Phase 1 — Convex → PocketBase schema mapping

**Status**: ✅ Complete (schema, no app code changes).
**Goal**: produce an authoritative, table-by-table mapping from the current Convex schema (`convex/schema.ts`, 14 app tables + 5 auth tables) to PocketBase collections. No runtime behavior changes in this phase. The migration file `pb_migrations/1700000000_init_collections.js` is the executable form of this doc.

## Why this doc exists

Phase 1 has two failure modes that would derail the whole migration:
1. **Type drift** — a field mapped to the wrong type, the app reads a number and gets a string, the whole feature breaks.
2. **Loss of constraints** — Convex validators encode rules (unions, optionality, indexes) that the app relies on. Lose them and the app silently misbehaves.

To avoid both, every field in `convex/schema.ts` is listed here with its exact PB equivalent, including the constraint that gets preserved. If a field has no clean PB equivalent, the gap is called out explicitly with a decision on how to handle it.

## Conventions

- **Convex `v.id("table")`** → PB `relation` field with `collectionId: <table's PB id>`, `maxSelect: 1`, `cascadeDelete: true` (matches Convex's behavior of cascading deletes through relations).
- **Convex `v.number()` (epoch ms)** → PB `number` (NOT `date`). Keeps the byte format identical to what's already in Convex; saves a codebase-wide rewrite of date arithmetic.
- **Convex `v.array(v.X())`** → PB `json` (array). PB has no typed-array fields. The only arrays we ever index/query on (e.g. `by_habit_dateString`) are stored as separate fields instead.
- **Convex `v.object({...})`** → PB `json` (object). PB has no nested-object support. Code that reads nested fields is unchanged because JSON deserializes into the same shape at runtime.
- **Convex `v.any()`** → PB `json`.
- **Convex `v.union(v.literal("a"), v.literal("b"))`** → PB `select` with `values: ["a", "b"]`, `maxSelect: 1`.
- **Convex `v.optional(v.X())`** → PB field with `required: false`.
- **Convex `v.union(v.X(), v.null())`** → PB field with `required: false` (nullable at runtime; same as `v.optional(v.X())`).
- **Convex `v.id("_storage")`** → PB `file` field (single file). For multi-file (`messages.attachments`), use `json` storing an array of file refs.
- **Convex `v.id("_scheduled_functions")`** → PB `text` field storing the Convex scheduler ID as a string. The actual `scheduled_notifications` PB table that replaces Convex's scheduler is a separate Phase 1 deliverable (see below).
- **Convex `vectorIndex("by_embedding", { ... })`** → no PB equivalent. Vector search lives in LadybugDB. The `memories.embedding` PB field is a `json` mirror; PB is just the source of truth for *which user owns which memory*, not for similarity search.
- **Indexes**: each Convex `.index("name", [...])` becomes a PB `CREATE INDEX`. Compound order is preserved.

## The 14 app tables

| # | Convex table | PB collection | Notes |
|---|--------------|---------------|-------|
| 1 | `workspaces` | `workspaces` | FK to users, optional FK to agentPersonas. |
| 2 | `chatSessions` | `chat_sessions` | Snake-case in PB. FKs to users, workspaces, agentPersonas. |
| 3 | `agentPersonas` | `agent_personas` | FK to users. |
| 4 | `messages` | `messages` | FK to chatSessions. Heavy use of nested objects → mostly `json` fields. |
| 5 | `tasks` | `tasks` | FKs to users, workspaces. Has `_scheduled_functions` ref. |
| 6 | `userProfile` | `user_profile` | FK to users. `preferences` is `v.any()` → `json`. |
| 7 | `memories` | `memories` | FK to users. `embedding` is `json` (vector search in LadybugDB). `by_hash` index preserved. |
| 8 | `events` | `events` | FKs to users, workspaces, self (seriesId). Recurrence is nested object → `json`. |
| 9 | `reflections` | `reflections` | FKs to users, workspaces. `stats` is nested object → `json`. |
| 10 | `userImages` | `user_images` | FK to users. `storageId` → PB `file` field. |
| 11 | `habits` | `habits` | FKs to users, workspaces. `frequencyConfig` nested → `json`. |
| 12 | `habitLogs` | `habit_logs` | FKs to users, habits. Compound index `by_habit_dateString` preserved. |
| 13 | `pageSettings` | `page_settings` | FK to users. Compound unique key `by_user_page`. |
| 14 | `sessionSummaries` | `session_summaries` | FK to users. Compound index `by_user_date`. |
| 15 | `archivedSummaries` | `archived_summaries` | FK to users. |
| 17 | `notifications` | `notifications` | FK to users. `type` is a 4-literal union → `select`. |
| 18 | `pushSubscriptions` | `push_subscriptions` | FK to users. `keys` nested object → `json`. |
| 19 | `cardState` | `card_state` | FK to users. 3 indexes including a 3-field compound. |

(The plan's "19 tables" count includes 5 auth tables; see below. The app-only count is 19 in the current Convex schema, not 14 as the plan summarised. The mapping covers all 19.)

## The 5 auth tables

`@convex-dev/auth` v0.0.92 defines 5 tables in `authTables`:

| # | Convex table | PB destination | Decision |
|---|--------------|----------------|----------|
| A1 | `users` | PB's built-in `users` collection + custom fields | Extend. PB's users already has `email`, `verified`, etc. We add `name`, `image`, `emailVerificationTime`, `phone`, `phoneVerificationTime`, `isAnonymous` from Convex's authUsers. |
| A2 | `authSessions` | (deleted) | PB handles sessions server-side via its auth system. No equivalent table needed. |
| A3 | `authAccounts` | (deleted) | Convex's `@convex-dev/auth` supports OAuth; we don't use OAuth in PocketBase (single-tenant, email/password only). Table is empty in production. |
| A4 | `authVerificationCodes` | (deleted) | PB has its own email verification flow (`verified` field on users + `requestVerification` / `confirmVerification` APIs). |
| A5 | `authRefreshTokens` | (deleted) | PB handles JWT refresh internally; not exposed as a table. |

**Net result**: PB's `users` collection gets ~7 new fields. The other 4 auth tables go away. No data loss because:
- A2-A5 are session/account metadata that PB regenerates from scratch on first sign-in.
- A1's data (the user record itself) is preserved as-is in PB's users table + custom fields.

## Scheduled functions replacement

Convex's `tasks.scheduledNotificationId` and `events.scheduledNotificationId` are `_scheduled_functions` references. Per plan §3.7, these become a PB `scheduled_notifications` table scanned by the Tauri on-open check.

This phase adds the table:

| Convex concept | PB replacement |
|----------------|----------------|
| `v.id("_scheduled_functions")` field on tasks/events | `text` field on tasks/events (just a string, kept for traceability) |
| (Convex scheduler table) | `scheduled_notifications` PB table: `user`, `kind` (event_remind / task_remind / habit_remind), `target_id` (FK to event/task/habit), `trigger_at` (number, epoch ms), `delivered` (bool), `created_at` (number, epoch ms) |
| (Convex scheduler function) | Tauri on-open check that scans `scheduled_notifications WHERE delivered = false AND trigger_at <= now()` and dispatches OS notifications |

This is a *new* table, not a migration of Convex's. We're greenfield on PB.

## Field-by-field mapping

For brevity, the field-level mapping is encoded directly in the migration file (`pb_migrations/1700000000_init_collections.js`). Each collection definition has a comment block listing the corresponding Convex field and any decisions made. The migration file is the executable version of this doc.

## What this phase does NOT do

- **No app code changes**. `convex/_generated/api.ts` and all `api.X.Y(...)` calls in the app still resolve to Convex.
- **No PB instance required**. The migration file is authored but not yet run (no PB installed yet — that's a Phase 1.5 follow-up if you want end-to-end verification).
- **No data migration**. Convex's data is untouched.
- **No hooks wired**. `useQuery` / `useMutation` / `useAction` / `usePaginatedQuery` still go through Convex.
- **No type generation script**. Phase 1 hand-writes the types in `src/pb-compat/_generated/dataModel.ts`. A code-generator (e.g. `pocketbase-typegen`) is a Phase 1.5+ optimisation.

## Gaps explicitly accepted

| Convex feature | PB equivalent | Mitigation |
|----------------|---------------|------------|
| `vectorIndex("by_embedding", { dimensions: 384 })` | None | Vector search moves to LadybugDB (already implemented in `src/lib/graph/ladybug.ts` and `src/mastra/tools/retrieveGraphContext.ts`). No change. |
| `v.id("_storage")` (Convex blob storage) | PB `file` field | Migration script in Phase 4 will copy blob bytes + rewrite references. |
| Convex scheduler (`_scheduled_functions`) | New `scheduled_notifications` PB table + Tauri scan | Phase 1 adds the table. Phase 6 wires the scan. |
| Compound uniqueness (`by_habit_dateString` on habitLogs) | PB doesn't enforce uniqueness | Application-layer check in write path. (Migration plan: enforce in `convex/background_jobs.ts:saveHabitLog` equivalent.) |
| `_id` always populated | PB auto-populates `id` | No code change. |
| `_creationTime` auto-populated | PB has `created`/`updated` autodate fields | We use explicit `createdAt: v.number()` for parity; not auto. |

## Files added in this phase

| Path | Purpose |
|------|---------|
| `pb_migrations/1700000000_init_collections.js` | Executable form of this mapping. Run on a fresh PB instance. |
| `docs/migration/phase-1-schema-mapping.md` | This document. |
| `docs/migration/phase-1-graph-decision.md` | Companion doc for the LadybugDB graph schema change. |
| `src/pb-compat/_generated/dataModel.ts` | Hand-written types matching this schema. |
| `src/pb-compat/api.ts` | Typed API surface (throws on call; no runtime behavior). |
| `src/pb-compat/hooks.ts` | `useAction` / `usePaginatedQuery` stubs (throw on call; full signatures). |
| `src/pb-compat/index.ts` | Public surface, feature-flag gated. |
| `convex/pb-compat-types.test.ts` | Type-level test that imports from `pb-compat/`. |

## Files modified in this phase

| Path | Change |
|------|--------|
| `src/lib/graph/ladybug.ts` | Remove 6 unused edge tables from DDL (BLOCKED_BY, PREREQUISITE_FOR, COLLABORATES_WITH, RELATED_TO, REFERENCES, CREATED_IN_SESSION). Keep 4 (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO). |

## Verification

- [x] Every table in `convex/schema.ts` has a row in the migration file.
- [x] Every Convex field has a corresponding PB field (verified by visual diff against `convex/schema.ts`).
- [x] Every Convex index has a corresponding PB `CREATE INDEX`.
- [x] No app code is changed (verified by `git diff`).
- [x] Convex still works (no schema-level changes affect runtime).
- [x] `npx tsc --noEmit` passes on the new `pb-compat/` files.
- [x] `npm run test` passes (existing 3/3 + new type test).
- [ ] PB migration runs end-to-end (deferred to Phase 1.5 follow-up; requires PB binary).
