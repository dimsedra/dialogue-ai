# Phase 2 — `pb-compat/` adapter layer + memory refinement

**Status**: 🟡 In progress (Stage 1.1 done; Stages 1.2-1.3 and Stages 2-9 pending)
**Owner**: User + opencode
**Plan ref**: `docs/MIGRATION_POCKETBASE.md` §5 Phase 2

---

## 1. Goal

Replace the Phase-1 stub hooks in `src/pb-compat/` with real PocketBase-backed implementations, and complete the first three items of the [ADR-012 §3 refinement roadmap](decisions/012-custom-memory-system-over-mastra-memory.md) so the trimmed graph schema is actually populated at runtime. The custom memory system stays (per ADR-012 — Mastra memory is declined).

**Done when**: `npm run test` passes, `npx tsc --noEmit` clean, and a single read-path call (e.g. `api.userProfile.get`) works behind `NEXT_PUBLIC_BACKEND=pocketbase` in dev with PB running locally.

---

## 2. Scope — three work streams

### Stream A — Memory refinement (ADR-012 items 1-3)

The custom memory system gets three additive improvements that prove the graph schema at runtime before we layer the adapter on top.

#### A.1 Wire `MENTIONS_TASK/EVENT/HABIT` edges in `saveSemanticMemory` — ✅ DONE (this commit)

**What changed:**
- New helper: `src/lib/graph/edges.ts` exports `wireMentionsEdges(conn, memoryId, { taskIds?, eventIds?, habitIds? })`. Idempotent (MATCH-then-MERGE). Returns `{ attempted, succeeded, failed }`.
- `src/mastra/tools/saveSemanticMemory.ts` extended: `inputSchema` now has optional `taskIds`, `eventIds`, `habitIds` arrays. The tool calls `wireMentionsEdges` after creating the Memory node.
- New test file: `src/lib/graph/edges.test.ts` with 10 tests covering all 3 edge types, multiple edges per call, idempotency, stale IDs (silent no-op), empty/undefined inputs.

**Schema rationale:** `docs/migration/phase-1-graph-decision.md`. The 4 kept edges (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO) are now actually populated.

**Stale IDs** are silent no-ops via `MATCH ... MATCH ... MERGE` — counted as `succeeded` (no exception) but no edge written. The MemoryHealth admin view (A.3) will surface these as orphans.

**LOC**: ~30 new in `edges.ts`, ~15 added to `saveSemanticMemory.ts` (inputSchema + import + call), ~210 in tests.

**Backwards compatible:** existing callers that don't pass `taskIds` etc. behave identically. Schema migration: none (LadybugDB DDL is already correct; edges were declared in Phase 1, just never written).

#### A.2 Add graph traversal to `retrieveGraphContext`

**What:** single-call expansion. When the agent queries "what do I know about X?", the tool returns not just the matched memory but its `RELATES_TO` neighbors and its `MENTIONS_*` entities (Task, Event, Habit).

**Current state** (`src/mastra/tools/retrieveGraphContext.ts:22-32`): the query already does `OPTIONAL MATCH (m)-[:MENTIONS_TASK]->(t:Task)` and `OPTIONAL MATCH (m)-[:MENTIONS_EVENT]->(e:Event)`. It is missing `MENTIONS_HABIT`. It also doesn't dedupe the returned memory by edge type (a memory mentioned 3 tasks would surface 3 times if we ORDER BY without DISTINCT).

**Plan:**
1. Add `OPTIONAL MATCH (m)-[:MENTIONS_HABIT]->(h:Habit)` to the query.
2. Add `collect(DISTINCT h)` and return it.
3. Add a `RETURN m, t, e, h` clause that flattens correctly (or use `collect()` per type as today).
4. Verify the `collect(t)` pattern doesn't produce duplicates under the new MENTIONS_HABIT.
5. Add a test that creates a memory with 2 task + 1 event + 1 habit mentions and verifies the traversal returns all 4.

**LOC estimate:** ~10 in tool, ~80 in tests.

#### A.3 Add `MemoryHealth` admin view

**What:** a small admin page (or API route + minimal UI) that surfaces:
- Total memory count
- Total edge count per type (MENTIONS_TASK/EVENT/HABIT)
- Orphan edges (stale IDs that the MATCH-RETURNED-0)
- Oldest memory timestamp
- Dedup ratio (memories with duplicate hashes / total memories)

**Why:** without visibility, we don't know if the graph is healthy. A.1's "stale IDs are silent no-ops" decision is acceptable only if we have a way to detect them.

**Plan:**
1. New API route: `src/app/api/admin/memory-health/route.ts`. Returns JSON.
2. Queries LadybugDB for: `MATCH (m:Memory) RETURN count(m)` etc. Computes edges per type with `MATCH ()-[r:REL]->() RETURN count(r)`.
3. UI: `src/app/admin/memory-health/page.tsx` — minimal table with the stats.
4. Gate behind the same `isAdmin` check (or hardcoded user check) as other admin views.
5. Add a test that creates a known graph and verifies the API route returns the right counts.

**LOC estimate:** ~50 in API route, ~80 in UI, ~60 in tests.

---

### Stream B — `pb-compat/` adapter (replaces Phase-1 stubs)

The Phase-1 stubs in `src/pb-compat/api.ts` and `src/pb-compat/hooks.ts` throw "Phase 1 stub" on every call. Phase 2 replaces them with real PocketBase-backed implementations. Per the migration plan, this is "a thin module that exposes the same `api.*` surface that the client code uses, but is backed by PocketBase."

#### B.1 Add `pocketbase` npm dep + client singleton

```bash
npm install pocketbase
```

**What:**
- `src/pb-compat/client.ts` — exports a `getPbClient()` singleton. Reads `NEXT_PUBLIC_PB_URL` (default `http://localhost:8090`). Lazily initializes.
- `src/pb-compat/auth.tsx` — React context that wraps the PB auth state. Exposes `useAuth()` returning `{ user, isAuthenticated, signIn, signOut, signUp }`.

**LOC estimate:** ~50.

#### B.2 Replace `useQuery` stub

**Current stub** (`src/pb-compat/hooks.ts`): throws "Phase 1 stub".

**New implementation** (in `src/pb-compat/use-query.ts`):
- Signature: `useQuery(api.workspaces.list, args?)` — same shape as Convex.
- Returns: `{ data, isLoading, error }`.
- Implementation:
  - Decode `api.X.Y` to `(collectionName, methodName)` via a lookup table.
  - `args` → PB filter (encoded in B.1, types in `_generated/dataModel.ts`).
  - On mount: `pb.collection(name).getList(filter)`.
  - Subscribe: `pb.collection(name).subscribe('*', cb)` → on event, re-fetch.
  - Cleanup: `unsubscribe()` + `AbortController.abort()` on unmount.
  - Per-call subscription (Stream B.5 — no shared dedup).

**Per-call subscription rationale** (Q3 decision): PB local WS cost is negligible. Shared dedup can be added in Phase 6+ if profiling shows it matters.

**LOC estimate:** ~80.

#### B.3 Replace `useMutation` stub

**New implementation** (in `hooks.ts`):
- Signature: `useMutation(api.X.create)` returns `{ mutate, mutateAsync, isLoading, error }`.
- Implementation: `mutate(args) → pb.collection(name).create(args)`.
- No optimistic updates (Q5 decision: parity, not better; defer to Phase 3+).

**LOC estimate:** ~40.

#### B.4 Replace `useAction` stub

**New implementation** (in `hooks.ts`):
- Signature: `useAction(api.X.someAction)` returns `{ run, runAsync, isLoading, error, data }`.
- Implementation: `run(args) → fetch('/api/pb-action/X', { method: 'POST', body: JSON.stringify(args) })`. Target = Next.js API route (Q2 decision: matches the Phase 6 background_jobs port).
- Each PB action in `pb_hooks/*.js` is wrapped by a Next.js API route under `src/app/api/pb-action/[name]/route.ts`. The wrapper:
  - Verifies the user is authenticated.
  - Forwards the args.
  - Returns the action's response.

**LOC estimate:** ~30 in hook + ~20 per action wrapper (we have ~8 actions, so ~160 total).

#### B.5 Replace `usePaginatedQuery` stub — ⭐ HIGHEST RISK IN PHASE 2

**New implementation** (in `src/pb-compat/use-paginated-query.ts`):
- Signature: `usePaginatedQuery(api.X.list, args, { initialNumItems })` returns `{ results, status, loadMore }`.
- Implementation:
  - **Cursor format**: opaque base64 of `{ lastId, pageSize }`. Survives re-subscribe.
  - Initial page: `pb.collection(name).getList(page=1, perPage=initialNumItems)`. Store last item's `id` as the cursor.
  - `loadMore()`: fetch next page, append.
  - Subscribe: `pb.collection(name).subscribe('*', cb)` → on event:
    - If a new item was created and its `id` is greater than the cursor's `lastId`, prepend it.
    - If an existing item in our `results` was updated, re-fetch that page.
  - Edge cases: empty list, page boundary, race on `loadMore` (cancel previous fetch).

**Why this is highest-risk:** chat is the most-touched surface. If pagination is buggy, every test downstream becomes suspect. Build *early* (after B.2-B.4 land).

**LOC estimate:** ~150 in hook + ~120 in tests (synthetic 10K-message session).

#### B.6 Wire `isPbBackend()` env flag

**Current state** (`src/pb-compat/index.ts`): always returns `false`.

**New implementation:**
```typescript
export const isPbBackend = (): boolean =>
  process.env.NEXT_PUBLIC_BACKEND === 'pocketbase';
```

**LOC estimate:** ~5.

#### B.7 First read-path call behind the flag

**What:** pick `api.userProfile.get` (lowest-risk, smallest surface) and wire it through `useQuery` to PB.

**Plan:**
1. Set `NEXT_PUBLIC_BACKEND=pocketbase` in `.env.local`.
2. Start PB locally: `pocketbase serve` (or use the existing `C:\Users\user\tools\pocketbase\pocketbase.exe`).
3. Run the dev server. Verify the settings page loads and shows the user profile from PB.
4. Flip the flag back to `convex`. Verify Convex still works (regression).
5. If both work, the adapter pattern is proven. Roll out to other read paths in Phase 3.

**LOC estimate:** ~30 (mostly verification).

---

### Stream C — Tests + documentation

#### C.1 Expand `pb-compat-types.test.ts`

Add type-level tests for the new `useQuery`, `useMutation`, `useAction`, `usePaginatedQuery` shapes. Each should verify:
- The hook returns the expected type given a typed `api.X.Y` reference.
- The args parameter is required vs optional correctly.
- The result type matches the Convex equivalent.

**LOC estimate:** ~100.

#### C.2 Hook unit tests

For each hook, write tests that:
- Set up a fresh PB instance.
- Run the hook with real PB.
- Assert the shape and happy-path result.

**LOC estimate:** ~80 per hook (320 total).

#### C.3 Integration test (Stream B.7)

The Stream B.7 smoke test codified as a Playwright/Cypress test. Single full flow: sign in, navigate to settings, see user profile from PB.

**LOC estimate:** ~100.

#### C.4 `docs/architecture/memory-system.md` (ADR-012 §3 item 6)

End-to-end doc of the custom memory system. Currently scattered across `saveSemanticMemory.ts`, `convex/ai.ts`, `convex/background_jobs.ts`, `retrieveGraphContext.ts`. One doc that explains: the write path, the read path, the dedup pipeline, the graph schema, the failure modes.

**LOC estimate:** ~250 (it's a doc).

---

## 3. Stage-by-stage plan

| Stage | Stream | Days | Risk | Deliverable |
|---|---|---|---|---|
| 1.1 Wire MENTIONS_* edges | A | 0.1 | Low | ✅ DONE — `wireMentionsEdges` helper, extended `saveSemanticMemory` schema, 10 tests pass |
| 1.2 Graph traversal in `retrieveGraphContext` | A | 0.25 | Low | Tool returns MENTIONS_HABIT + deduped results; test |
| 1.3 MemoryHealth admin view | A | 0.5 | Low | API route + UI + orphan detection |
| 2 Foundation (PB dep + client + auth context) | B | 0.5 | Low | `pocketbase` npm dep, `client.ts`, `auth.tsx` |
| 3 `useQuery` (B.2) | B | 1.5 | Med | Per-call PB subscription, types, tests |
| 4 `useMutation` (B.3) | B | 0.5 | Low | Write hook, no optimistic, tests |
| 5 `useAction` (B.4) | B | 0.5 | Med | Next.js API route wrapper, 8 actions |
| 6 `usePaginatedQuery` (B.5) | B | 2 | **High** | Opaque cursor, subscribe-with-prepend, 10K-msg test |
| 7 Env flag (B.6) | B | 0.25 | Low | `isPbBackend()` reads `NEXT_PUBLIC_BACKEND` |
| 8 First read-path call (B.7) | B | 1 | Med | `api.userProfile.get` works in dev with PB |
| 9 Tests (C.1, C.2, C.3) | C | 1.5 | Med | Type + unit + integration tests |
| 10 Docs (C.4) | C | 0.5 | Low | `memory-system.md` |
| **Total** | | **~9 days** | | |

**Critical path**: Stage 6 (`usePaginatedQuery`). If this takes > 2 days, the estimate creeps. Build it *early* (right after Stage 3 lands) so we have buffer.

---

## 4. Decisions locked

| Q | Decision | Why |
|---|---|---|
| 1. File layout | One file per heavy hook, shared `hooks.ts` for light ones | `usePaginatedQuery` earns its own file (~150 LOC); mutation/action share |
| 2. Action target | Next.js API route (not PB JS hook) | Matches Phase 6 background_jobs port; fewer moving parts |
| 3. Subscription dedup | Per-call (not shared) | PB local WS cost negligible; simpler code |
| 4. Hook parity test | Hybrid: type-level + small integration | Phase 1 type tests already pin shape; full snapshot parity is Phase 3 |
| 5. Optimistic updates | NO in Phase 2 (parity) | Add in Phase 3+ when we have latency data |

---

## 5. Open risks specific to Phase 2

- **Reconnect storms** (B.5): PB WebSocket drops → re-subscribe → "did I miss messages?" Cursor format must use `lastId`, not page number. Mitigation: use `lastId` cursors + re-fetch from cursor on reconnect.
- **Subscription leaks** (B.2-B.5): every `useQuery` opens a WS subscription. Unmount mid-fetch = leak. Mitigation: `useEffect` cleanup with `unsubscribe()` + `AbortController.abort()`.
- **Filter encoding** (B.2): Convex `args` are typed; PB filters are untyped strings. Mismatch surface is large. Mitigation: typed args in the hook signature, internal PB filter encoding; types live in `_generated/dataModel.ts`.
- **Realtime for new collections** (B.5): `scheduled_notifications` is new. The Tauri on-open scan finds a new row → React app needs to re-fetch. Verify subscribe works for collections that didn't exist in Convex.
- **Per-call subscription at scale** (B.2): if a future screen renders 100 components all subscribed to `useQuery(api.tasks.list)`, that's 100 PB WS subscriptions. Acceptable for our scale (single-user desktop), not for multi-tenant. Mitigation: revisit in Phase 6+ if profiling shows it matters.

---

## 6. Exit criteria (Phase 2 done when ALL are true)

1. `npx tsc --noEmit` clean
2. `npm run test` passes (target: 50+ tests, up from current 34)
3. `npx eslint` produces no new errors (pre-existing 144 errors are out of scope; see ADR-011 freeze)
4. `api.userProfile.get` works behind `NEXT_PUBLIC_BACKEND=pocketbase` in dev with PB running
5. Same call still works with Convex (regression) when flag is unset
6. `MemoryHealth` admin view shows the four kept graph edges populated after one `saveSemanticMemory` call
7. `phase-2-adapter.md` (this doc) and `memory-system.md` exist
8. `pb-compat/hooks.ts` and `src/pb-compat/use-paginated-query.ts` are no longer "Phase 1 stub" — they call real PB

---

## 7. Cut policy (what to defer if time-pressed)

- **Stream A.3 (MemoryHealth admin view)** — nice-to-have; can move to Phase 3
- **Stream C.4 (`memory-system.md`)** — can move to Phase 3
- **Stream B.7 (first read-path call)** — can be replaced by a smoke test in the integration test (C.3)

**Cannot cut**: Stages 2-6 (the hooks) and Stream B.6 (env flag). Those are the Phase 2 deliverable.

---

## 8. Related

- `docs/MIGRATION_POCKETBASE.md` §5 Phase 2 — the parent plan
- `docs/decisions/012-custom-memory-system-over-mastra-memory.md` — why we're refining, not adopting
- `docs/migration/phase-1-graph-decision.md` — schema rationale for the MENTIONS_* edges
- `docs/migration/phase-1-schema-mapping.md` — the PB collection definitions
- `docs/migration/phase-1-5-pb-verification.md` — the 117/117 schema checks
- `src/pb-compat/_generated/dataModel.ts` — hand-written types (Phase 1)
- `src/pb-compat/api.ts` — typed `api` namespace (Phase 1)
- `src/pb-compat/hooks.ts` — Phase 1 stub (replaced in this phase)
- `src/lib/graph/ladybug.ts` — DDL + connection singleton
- `src/lib/graph/edges.ts` — `wireMentionsEdges` (added in this phase)
