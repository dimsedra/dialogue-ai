# Phase 3 — Migrate Read Paths Behind a Flag

**Status**: 🟢 Done  
**Owner**: User + Antigravity  
**Plan ref**: `docs/MIGRATION_POCKETBASE.md` §5 Phase 3  

---

## 1. Goal

Port all read-only query paths (workspaces, sessions, personas, tasks, events, habits, and dashboard proactive card state queries) from Convex to PocketBase. These read paths must run concurrently using a dual-hook pattern in client components, selecting the PocketBase results when the build-time flag `isPbBackend()` is enabled.

**Done when**: 
- Centralized query descriptors for all Phase 3 read paths are registered in `src/pb-compat/api.ts`.
- All custom React hook wrappers (handling timezone-aware recurrence and client-side streak calculations) are exported from `src/pb-compat/hooks.ts` and `src/pb-compat/index.ts`.
- All consumer UI components (`Chat.tsx`, `TaskPanel.tsx`, `Dashboard.tsx`, `SessionSidebar.tsx`, workspace page, agent page) are flipped to support the dual-hook backend selection.
- All unit tests, type-level tests, pagination stress tests, and a dedicated read-paths smoke test run and pass successfully.

---

## 2. Scope

### Stream A — Query Descriptors (`src/pb-compat/descriptors/`)
We implemented descriptors containing the collection name, kinds, and `buildFilter` logic matching the Convex filtering behaviors.

* **Workspaces** ([workspaces.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/workspaces.ts)): Lists workspaces owned by the authenticated user and gets a single workspace by ID.
* **Agent Personas** ([personas.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/personas.ts)): Lists personas owned by the user.
* **Chat Sessions** ([chatSessions.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/chatSessions.ts)): Lists chat sessions filtered by user and workspace (or filters out workspaces for workspace-agnostic sessions) and gets a session by ID.
* **Tasks** ([tasks.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/tasks.ts)): Lists active/completed tasks and searches task history by query text/time range.
* **Events** ([events.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/events.ts)): Lists raw events and past event history.
* **Habits** ([habits.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/habits.ts)): Lists active habits, habit logs, gets a single habit, and computes consistency.
* **Dashboard Proactive States** ([dashboard.ts](file:///d:/Project%20Hub/Dialogue-AI/src/pb-compat/descriptors/dashboard.ts)): Implements all 8 unified queries (attention needed, reflection ready, task triage, morning brief, event prep, habit check, evening log, muted card states) to query the local PocketBase tables and execute identical processing logic as the server-side Convex dashboard functions.

---

### Stream B — Custom React Hook Wrappers (`src/pb-compat/hooks/`)
To achieve structural type parity with Convex shapes, the hook wrappers translate PocketBase records (converting 15-char random `id` to branded Convex `_id` and string ISO timestamps to Unix epoch milliseconds).

* **Timezone-Aware Recurrence Expansion**: Inside `usePbEventsList()`, raw recurring event records from PocketBase are expanded locally on the client (`expandRecurringEvents`) to emulate the server-side event generation logic.
* **Streak & Weekly Aggregation calculations**: Inside `usePbHabitsList()` and `usePbHabit()`, active streaks, weekly completion rates, and historical logs are aggregated client-side, reducing the backend VM footprint.
* **Assistant Persona Prepended**: `usePbPersonasList()` automatically prepends the hard-coded default Dialogue assistant persona (`default_dialogue`) at the head of the returned array to match Convex behavior.

---

### Stream C — UI Consumer Flipping
We updated all consumer files to wire the dual-hook pattern unconditionally:
* `Chat.tsx` (workspaces, sessions, personas)
* `TaskPanel.tsx` (workspaces, tasks, events, habits)
* `Dashboard.tsx` (personas, proactive card states)
* `SessionSidebar.tsx` (personas)
* `src/app/workspace/[id]/page.tsx` (workspace, personas)
* `src/app/agent/page.tsx` (personas)

---

## 3. Database Migration Refinement

To support seeding and normal operation of the PocketBase database during read-only verification, we resolved key validation constraints in `pb_migrations/1700000000_init_collections.js`:
* **Boolean Fields**: Set `required: false` on `completed` (tasks), `archived` (habits), `read` (notifications), and `delivered` (scheduled_notifications). Because PocketBase validation treats `false` as a "blank/zero" value, keeping these fields as `required: true` made it impossible to save records that start as uncompleted, unarchived, or unread.
* **JSON Fields**: Set `required: false` on `frequencyConfig` (habits) to allow empty JSON objects like `{}` to be saved.

---

## 4. Verification and Test Results

Four separate test suites validate the correctness of this phase:

### 1. Read Paths Smoke Test (`scripts/smoke-pb-readpaths.mjs`)
* Spawns a temporary PocketBase instance, applies migrations, seeds records for workspaces, personas, sessions, tasks (including overdue ones), events, habits, reflections, and card states, and asserts that all read queries return parsed records in the expected Convex-compatible shapes.
* **Result**: `11 passed, 0 failed` (Run via `npm run test:smoke:reads`)

### 2. Migration Schema Verification (`scripts/verify-pb-migration.mjs`)
* Ensures that the SQLite schema generated by `1700000000_init_collections.js` matches the spec and has the correct fields, indexes, cascade delete rules, and select values.
* **Result**: `117 passed, 0 failed` (Run via `node scripts/verify-pb-migration.mjs "C:\path\to\pocketbase.exe"`)

### 3. Unit & Type-Level Tests (`npm test`)
* Runs the unit tests under `src/pb-compat/descriptors/` and the type-level assertions in `convex/pb-compat-types.test.ts`.
* **Result**: `170/170 tests passed`.

### 4. Pagination Stress Test (`npm run test:stress`)
* Populates 10,000 items into a temporary PocketBase collection and verifies cursor pagination, reactive WebSocket subscription updates (prepends, updates, deletes), and reconnect safety.
* **Result**: `17 passed, 0 failed`.

---

## 5. Companion Artifacts

### New Files
* `scripts/smoke-pb-readpaths.mjs` — E2E read path integration smoke test.
* `src/pb-compat/descriptors/workspaces.ts` / `workspaces.test.ts`
* `src/pb-compat/descriptors/personas.ts` / `personas.test.ts`
* `src/pb-compat/descriptors/chatSessions.ts` / `chatSessions.test.ts`
* `src/pb-compat/descriptors/tasks.ts` / `tasks.test.ts`
* `src/pb-compat/descriptors/events.ts` / `events.test.ts`
* `src/pb-compat/descriptors/habits.ts` / `habits.test.ts`
* `src/pb-compat/descriptors/dashboard.ts` / `dashboard.test.ts`
* `src/pb-compat/hooks/use-pb-workspaces.ts`
* `src/pb-compat/hooks/use-pb-personas.ts`
* `src/pb-compat/hooks/use-pb-sessions.ts`
* `src/pb-compat/hooks/use-pb-tasks.ts`
* `src/pb-compat/hooks/use-pb-events.ts`
* `src/pb-compat/hooks/use-pb-habits.ts`

### Modified Files
* `pb_migrations/1700000000_init_collections.js` — updated boolean & JSON field constraint checks.
* `src/pb-compat/api.ts` — registered all newly created query descriptors on the `api` object.
* `src/pb-compat/hooks.ts` / `index.ts` — re-exported new hooks from the barrel files.
* `src/pb-compat/use-query.ts` — adjusted to handle `"skip"` argument gracefully.
* `convex/pb-compat-types.test.ts` — extended type assertions.
* `package.json` — registered the `test:smoke:reads` command.
* **UI Components**: `Chat.tsx`, `TaskPanel.tsx`, `Dashboard.tsx`, `SessionSidebar.tsx`, `src/app/workspace/[id]/page.tsx`, `src/app/agent/page.tsx` — wired dual-hook selectors.
