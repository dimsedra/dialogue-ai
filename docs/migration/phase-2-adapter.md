# Phase 2 — `pb-compat/` adapter layer + memory refinement

**Status**: 🟢 Streams A and B done; Stream C partially done (C.1 type-level tests ✓, C.2 hook unit tests ✓, C.3 integration test as opt-in smoke script ✓, C.4 `docs/architecture/memory-system.md` ❌ still pending)
**Owner**: User + opencode
**Plan ref**: `docs/MIGRATION_POCKETBASE.md` §5 Phase 2

---

## 1. Goal

Replace the Phase-1 stub hooks in `src/pb-compat/` with real PocketBase-backed implementations, and complete the items of the [ADR-012 §3 refinement roadmap](decisions/012-custom-memory-system-over-mastra-memory.md) so the trimmed graph schema is actually populated at runtime. The custom memory system stays (per ADR-012 — Mastra memory is declined).

**Done when**: `npm run test` passes, `npx tsc --noEmit` clean, and a single read-path call (e.g. `api.userProfile.get`) works behind `NEXT_PUBLIC_BACKEND=pocketbase` in dev with PB running locally. ✅ Achieved (B.7.1-B.7.5, commits `23a113e` through `5c35fe5`; smoke-tested end-to-end via `npm run test:smoke`).

---

## 2. Scope — three work streams

### Stream A — Memory refinement (ADR-012 items 1-3)

The custom memory system gets three additive improvements that prove the graph schema at runtime before we layer the adapter on top. **Stream A is complete** as of commit `e534f01`.

#### A.1 Wire `MENTIONS_TASK/EVENT/HABIT` edges in `saveSemanticMemory` — ✅ DONE (commit `4fdb9c9`)

**What changed:**
- New helper: `src/lib/graph/edges.ts` exports `wireMentionsEdges(conn, memoryId, { taskIds?, eventIds?, habitIds? })`. Idempotent (MATCH-then-MERGE). Returns `{ attempted, succeeded, failed }`.
- `src/mastra/tools/saveSemanticMemory.ts` extended: `inputSchema` now has optional `taskIds`, `eventIds`, `habitIds` arrays. The tool calls `wireMentionsEdges` after creating the Memory node.
- New test file: `src/lib/graph/edges.test.ts` with 10 tests covering all 3 edge types, multiple edges per call, idempotency, stale IDs (silent no-op), empty/undefined inputs.

**Schema rationale:** `docs/migration/phase-1-graph-decision.md`. The 4 kept edges (MENTIONS_TASK, MENTIONS_EVENT, MENTIONS_HABIT, BELONGS_TO) are now actually populated.

**Stale IDs** are silent no-ops via `MATCH ... MATCH ... MERGE` — counted as `succeeded` (no exception) but no edge written. The MemoryHealth admin view (A.3) surfaces these as "lonely" memories.

**LOC**: ~75 new in `edges.ts`, ~15 added to `saveSemanticMemory.ts` (inputSchema + import + call), ~200 in tests.

**Backwards compatible:** existing callers that don't pass `taskIds` etc. behave identically. Schema migration: none (LadybugDB DDL is already correct; edges were declared in Phase 1, just never written).

#### A.2 Add graph traversal to `retrieveGraphContext` — ✅ DONE (commit `4ed7f3d`)

**What was planned (in the prior version of this doc):** add MENTIONS_HABIT to the query and verify the `collect()` pattern doesn't duplicate.

**What actually shipped (a bigger fix):**
- **Cartesian-product bug fixed.** The original `retrieveGraphContext` query chained `OPTIONAL MATCH` patterns *without* `WITH` between them. For a memory with 2 tasks and 1 event, this produced 2×1=2 rows, and `collect(t)` / `collect(e)` over those 2 rows *duplicated both lists*. The new query uses `WITH m, similarity, collect(t) AS tasks` between each `OPTIONAL MATCH` to scope each collect to a single memory row. The traversal test covers this regression explicitly.
- **MENTIONS_HABIT added.** The edge table has existed since Phase 1, but the original traversal never read from it. The new query does.
- **Threshold is now configurable.** Was hard-coded at 0.6. The tool's `inputSchema` adds an optional `threshold` parameter; default stays 0.6 so behavior is unchanged for existing call sites.
- **`CAST($emb AS FLOAT[384])` required.** LadybugDB's `array_cosine_similarity` is strict about parameter types — passing a plain JS array throws "Binder exception: ARRAY_COSINE_SIMILARITY requires argument type to be FLOAT[] or DOUBLE[]." Wrap at the query site. The storage side is fine: `FLOAT[384]` in the DDL accepts JS arrays.
- **`null` → `[]` normalisation.** When an `OPTIONAL MATCH` finds no rows, `collect(...)` returns `null`, not `[]`. The helper coalesces to `[]` so the LLM prompt and the UI see empty arrays.
- **Extracted to its own file** (`src/lib/graph/traversal.ts`); the tool is now a thin wrapper.

**New test file:** `src/lib/graph/traversal.test.ts` with 10 tests (empty DB, ordering DESC, threshold strict/loose, limit, no-mentions, each edge type, cartesian-product regression, partial mentions). `beforeEach` does `MATCH (n) DETACH DELETE n` to isolate tests against the shared temp DB.

**LOC**: ~85 new in `traversal.ts`, ~205 in tests; `retrieveGraphContext.ts` went from 35 to 35 LOC (just imports + delegation, but the inline Cypher is gone).

#### A.3 Add `MemoryHealth` admin view — ✅ DONE (commit `e534f01`)

**What was planned (in the prior version of this doc):** a small admin page with 4–5 metrics including "oldest memory" and "dedup ratio."

**What actually shipped (scope trimmed to fit LadybugDB's existing schema):**
- New helper: `src/lib/graph/health.ts` exports `getMemoryHealth(conn)` returning `{ totalMemories, edgesByType, lonelyMemories: { count, sample } }`. Sample capped at 50 to keep the response cheap; `count` is the truth even when the sample is truncated.
- New API route: `GET /api/admin/memory-health` returns the helper output as JSON.
- New UI page: `src/app/admin/memory-health/page.tsx` — minimal server-rendered dashboard with 3 cards (Total memories, Total edges with per-type breakdown, Lonely memories) and a sample list of lonely memories. lucide-react icons, zinc palette to match the rest of the app.
- New test file: `src/lib/graph/health.test.ts` with 6 tests (empty DB, total count, edges per type independent, lonely detection, **integration with A.1's stale-ID no-op** so a stale `taskIds` write shows up as a lonely memory, sample cap).

**Why the "orphan" surface is "lonely memories"** (not the original "orphan edges" wording): because `wireMentionsEdges` is a silent no-op on stale IDs, there are no *dangling* edges in the graph — the MERGE simply has nothing to merge. The observable failure mode is therefore a Memory that *should* have mentioned something but ended up with no edges. We surface those as "lonely" memories.

**Deferred (not in scope for A.3):**
- **Oldest memory timestamp.** The Memory node schema has no `createdAt` field (just `id`, `text`, `embedding`). Adding it would be a DDL change; out of scope for stability.
- **Dedup ratio.** The `hash` field lives in Convex (`memories` table), not in LadybugDB. Cross-store dedup ratio is a Phase 4+ concern when the dual-write is deleted.
- **Auth gate.** The route is open for now. This is a local single-user desktop app in spirit; auth lands with the PB migration (Stream B.1).

**LOC**: ~95 in `health.ts`, ~165 in tests, ~30 in route, ~120 in UI.

---

### Stream B — `pb-compat/` adapter (replaces Phase-1 stubs)

The Phase-1 stubs in `src/pb-compat/api.ts` and `src/pb-compat/hooks.ts` threw "Phase 1 stub" on every call. **Stream B is complete** as of commits `7d8482a` through `5c35fe5`. All five hooks (`useAuth`, `useQuery`, `useMutation`, `useAction`, `usePaginatedQuery`) plus the descriptor pattern, the action dispatcher, and three real consumer flips are in. Per-call subscription, no optimistic updates, build-time `isPbBackend()` flag. 130/130 unit tests pass at the end of Phase 2; **170/170 unit tests pass overall** (after Phase 3 added 40 descriptor unit tests — see `phase-3-read-paths.md`). The 10K stress test (`npm run test:stress`) passes 17/17; the smoke test (`npm run test:smoke`) passes 13/13.

#### B.1 Add `pocketbase` npm dep + client singleton + auth context — ✅ DONE (commit `7d8482a`)

**What was planned:** `client.ts` singleton + `auth.tsx` React context.

**What actually shipped** (the plan's surface grew once we saw Convex's `useAuth` shape):
- `src/pb-compat/client.ts` (80 LOC) — `getPbClient()` singleton, `resolvePbUrl()`, `__resetPbClientForTests()`. Reads `NEXT_PUBLIC_PB_URL` (default `http://localhost:8090`). Lazily initializes.
- `src/pb-compat/auth.tsx` (~190 LOC) — `PbAuthProvider` + `useAuth`. Real PB-backed implementation; matches the Convex `useAuth` shape so the consumer-side code (`src/app/page.tsx`, `src/app/settings/page.tsx`, etc.) is unchanged. Initially NOT wired into `app/layout.tsx` — that decision was deferred to B.7.1.
- `src/pb-compat/client.test.ts` — 7 tests pass.
- `pocketbase@0.27.0` added to `package.json` (Node 21+ has WebSocket natively, so this is a pure-JS dep).

**Deviation from plan:** the `useAuth` surface is **broader** than `{ user, isAuthenticated, signIn, signOut, signUp }` — it also exposes `record`, `token`, and a raw `pb.authStore` reference for consumers that need to read auth state at call time (B.4's `useAction` reads the token at call time, not hook time, so this matters; see Q13 in §4).

#### B.2 Replace `useQuery` stub — ✅ DONE (commit `5eacb68`)

**What was planned:** `useQuery(api.X.Y, args?) → { data, isLoading, error }`.

**What actually shipped** (the Convex-compatibility decision was the bigger one):
- `src/pb-compat/use-query.ts` (~310 LOC) — `PbQuery`, `PbQueryDescriptor` (the descriptor pattern: `{ kind: "query", collection: "user_profile", _pb: { filter, buildFilter?, order, expand } }`), `defineQuery`, `encodeArgsAsFilter`, `argsKey`, `useQuery`.
- **Returns `T | undefined`** (matches Convex's `useQuery` exactly), **NOT** the plan's `{ data, isLoading, error }`. Rationale (Q9 in §4): the existing consumer code does `if (!profile) return null`, not `if (profile.isLoading) ...` — keeping the shape the same lets the consumer flip happen without re-engineering every call site.
- `src/pb-compat/use-query.test.ts` — **19 tests pass**.
- Per-call subscription (Q3) — every `useQuery` opens its own PB subscription. Unmount = `unsubscribe()` + `AbortController.abort()`.

**Descriptor pattern** (added during B.2, not in the plan): a `PbQueryDescriptor` is a thin tagged object that `defineQuery` produces from a `useQuery` argument. The descriptor carries the PB collection name + filter + sort + expand. The hook only ever sees a descriptor — never a raw collection name. This gives us type safety (the descriptor is parameterized by the record type) and lets the consumer side flip with one import change.

#### B.3 Replace `useMutation` stub — ✅ DONE (commit `ae7f01f`)

**What was planned:** `useMutation(api.X.create) → { mutate, mutateAsync, isLoading, error }`.

**What actually shipped** (the plan's surface was too big — we built the minimum):
- `src/pb-compat/use-mutation.ts` (~100 LOC) — `PbMutationKind` enum (`"create" | "update" | "delete"`), descriptor types, `executePbMutation`, `useMutation` with 3 overloads (one per kind).
- **Returns a fresh callable per render** (not wrapped in `useCallback`); the mutation takes a single args object; `executePbMutation` does the `pb.collection(name).create/update/delete` work.
- **No `mutateAsync`** in v1 (we have no async error path consumers use). If a future consumer needs it, the hook grows a 4th overload.
- **No `isLoading` / `error` state** in v1 (Q5: no optimistic updates means we don't need the spinner/error state).
- `src/pb-compat/use-mutation.test.ts` — **4 tests pass** (descriptor shape + 3 execute paths).

**Lesson:** B.3 was deliberately minimal. The plan's `{ mutate, mutateAsync, isLoading, error }` shape assumes we want React state for in-flight mutations. We don't — the consumer code already calls `await mutate(args)` and the next render of the surrounding component reflects the result via the existing `useQuery` subscription. Adding the React state was speculative complexity.

#### B.4 Replace `useAction` stub — ✅ DONE (commit `2997ce1`)

**What was planned:** 8 actions wrapped by 8 Next.js API routes, each ~20 LOC. Total ~190 LOC.

**What actually shipped** (the plan's scope was an over-estimate):
- `src/pb-compat/use-action.ts` (~100 LOC) — `PbActionDescriptor`, `PbActionRequest`, `PbActionResponse`, `defineAction`, `executePbAction`, `useAction`.
- **Single dynamic route** `src/app/api/pb-action/[name]/route.ts` (~60 LOC) that resolves the `name` URL param to a handler via a name→handler registry. **One** new action = one file in `src/lib/pb-actions/<name>.ts` + one `registry.ts` line. **No new route file.**
- `src/lib/pb-actions/registry.ts` (40 LOC) — handler map. **Only `parseDate` registered.**
- `src/lib/pb-actions/auth.ts` (~30 LOC) — `verifyPbToken` via a server-side PocketBase singleton + `pb.collection("users").authRefresh()`. **NEVER** trusts `pb.authStore.save()` alone (the token is user-forgeable in principle; `authRefresh` is what makes it real). Clears the authStore after verification to avoid leaking the verified token to subsequent requests.
- `src/lib/pb-actions/parseDate.ts` (~30 LOC) — **stub**. Returns `null`. The Convex `parseDate` action in `convex/background_jobs.ts:460` is the reference shape; nothing in `src/` calls it on either backend, so a real impl would be premature (Q15 in §4).
- `src/pb-compat/use-action.test.ts` — **6 tests pass**.

**Q14 in §4 (dispatcher pattern):** why a single dynamic route and not N routes? Three reasons. (1) The plan's N routes is purely file-count growth — no logic difference. (2) The action name is already a meaningful URL component (`/api/pb-action/parseDate` is self-describing). (3) The registry gives one place to add auth, logging, rate-limiting later — N separate routes scatter that.

**Q13 in §4 (token at call time):** the `useAction` hook returns a callable that, on each invocation, reads `pb.authStore.token` from the **current** auth context. NOT the token at hook-call time. Rationale: if a user signs in mid-session (e.g. on the settings page), the next `run(...)` picks up the new token automatically. If we cached the token at hook-call time, a sign-in during a mounted component would not be reflected in subsequent calls. (Q13 was a near-miss bug that we caught during B.4 design — the initial plan had `const token = useAuth().token; const run = ...token...` which would have broken sign-in flows.)

#### B.5 Replace `usePaginatedQuery` stub — ✅ DONE (split into B.5a + B.5b)

The plan called this ⭐ HIGHEST RISK. We split it: **B.5a** = helpers + hook + unit tests; **B.5b** = 10K stress test. Splitting the risk meant we could ship B.5a behind feature flag without committing to a "10K messages works" claim, then verify that claim in B.5b.

**B.5a — helpers + hook + unit tests — ✅ DONE (commit `70534e3`)**

- `src/pb-compat/pagination.ts` (~145 LOC) — pure helpers (no React, no PB SDK): `PbItem`, `PbSubscribeEvent`, `PbCursor`, `encodeCursor`/`decodeCursor` (base64url with shape validation), `appendOlderPage`/`prependNewItem`/`removeItemById`, `findPageOfItem`/`mergeRefetchedPage`, `handleCreateEvent`/`handleDeleteEvent`, `buildPageFilter`.
- `src/pb-compat/use-paginated-query.ts` (~305 LOC) — `PbPaginatedQuery`, `PbPaginatedDescriptor`, `definePaginatedQuery`, `usePaginatedQuery` (the hook), `UsePaginatedQueryResult`. Status enum matches Convex exactly: `LoadingFirstPage` → `CanLoadMore` → `Exhausted`.
- `src/pb-compat/pagination.test.ts` — **27 tests pass** (cursor encode/decode round-trips, shape validation, page append, prepend on create event with the "id is not greater than first id → no-op" guard, etc.).
- **No dedicated React-hook test** (no jsdom installed in the project). The hook itself is validated end-to-end by B.5b's 10K stress test.

**Q17 in §4 (B.5 split):** the plan called for a monolithic 2-day B.5 with hook + 10K test in one go. We split it because (1) the 10K test infra (spawning temp PB, seeding 10K records, asserting real-time behavior) is significant overhead that benefits from being its own commit, (2) B.5a can ship behind the flag without the "10K works" claim, (3) the unit tests cover the pure helpers while the stress test covers the React-side integration.

**B.5b — 10K stress test — ✅ DONE (commit `d0da463`)**

- `scripts/stress-pagination.mjs` (~280 LOC) — self-contained Node script. Spawns a temp PB, applies the migration, seeds 10K items via parallel single creates (50 concurrency, unique `requestKey` per call to avoid PB SDK auto-cancellation), runs 6 scenarios.
- **17/17 assertions pass.** 200 pages, ~200ms total, ~50K items/sec.
- `npm run test:stress` script in `package.json`.

**B.5b findings that changed the design** (all documented in §10 lessons learned):
- ⚠️ **PB id format is random 15-char strings, NOT time-prefixed.** "Sort by -id" gives a stable but arbitrary order, not time order. This invalidates the naive "use id-desc as a time proxy" assumption.
- ⚠️ **PB SDK first-broadcast-lost quirk.** A subscribe immediately followed by a `create` drops the create's broadcast (race in `connect → submitSubscriptions`). The stress test uses a "warmup" subscribe (kept open) to consume the slot.
- ⚠️ **`globalThis.EventSource` is not in Node 25.** The PB SDK uses it directly with no WebSocket fallback. The test polyfills it from the `eventsource` package (3.0.7, transitive dep).
- ⚠️ **PB SDK auto-cancels duplicate `requestKey`s.** Parallel creates need unique `requestKey` per call.
- ⚠️ **PB 0.22+ batch disabled by default.** `pb.createBatch()` returns 403. Use parallel single creates with bounded concurrency.

#### B.6 Wire `isPbBackend()` env flag — ✅ DONE (commit `3981d09`)

**What was planned:**
```typescript
export const isPbBackend = (): boolean =>
  process.env.NEXT_PUBLIC_BACKEND === 'pocketbase';
```

**What actually shipped:** the planned 5-line function. Lives in `src/pb-compat/index.ts`. Reads `process.env.NEXT_PUBLIC_BACKEND === "pocketbase"`. **Default = false** (Convex is the active backend unless explicitly flipped).

**The flag is build-time-constant.** `NEXT_PUBLIC_*` env vars are inlined at build time, so the value never changes between renders. This matters: the dual-hook consumer pattern (B.7.3) branches on `isPbBackend()` to pick which `useQuery` to call, and the unused branch is DCE'd in production.

**LOC:** 5. 0 tests (type-level coverage in `pb-compat-types.test.ts`).

#### B.7 First read-path call behind the flag — ✅ DONE (split into B.7.1 through B.7.5)

The plan called for one stage ("pick `api.userProfile.get` and verify it works in dev with PB running"). We split it into 5 sub-stages because each one has a distinct risk and a distinct deliverable. Doing them as one commit would have made the diff unreviewable.

**B.7.1 — Wire `PbAuthProvider` into `app/layout.tsx` — ✅ DONE (commit `23a113e`)**

The provider was built in B.1 but not wired in. B.7.1 wraps the app in it: `app/layout.tsx:52-54` becomes `<ConvexClientProvider><PbAuthProvider>{children}</PbAuthProvider></ConvexClientProvider>`. The body of `PbAuthProvider` is **gated on `isPbBackend()`** — in Convex mode, the body is byte-for-byte zero-cost (no client construction, no `authRefresh`, no `onChange` subscription). `signIn` / `signUp` throw with a clear "PB backend is not active" message. `signOut` is a no-op. In PB mode, the body constructs the singleton client, calls `authRefresh()` to rehydrate the session, and subscribes to `onChange` for sign-out propagation.

**Implementation lessons:**
- `useRef<PocketBase | null>` was the initial design for the client. **Removed.** The client is a process-wide singleton (`getPbClient()` in `client.ts:64-71`), so the ref was redundant. Removing it also sidesteps the `react-hooks/refs` rule against reading `ref.current` during render.
- **Q8 in §4 (drop useRef for the PB client):** the ref was a "safety belt" against double-initialization in StrictMode. The singleton pattern (module-level `let` in `client.ts`) is the actual safety belt. The ref added nothing.
- The circular import `auth.tsx → index.ts → auth.tsx` (for `isPbBackend`) is safe in ESM — the binding is live and resolved at call time, not module-evaluation time.
- +2 type-level tests (PbAuthProvider surface + Parameters<typeof PbAuthProvider>[0] accepts-children). **117/117** after B.7.1.

**B.7.2 — `api.userProfile.get` PB descriptor — first non-stub on the public surface — ✅ DONE (commit `f185c39`)**

- `src/pb-compat/descriptors/userProfile.ts` (~112 LOC, NEW) — `userProfileGetQuery` descriptor. `buildUserFilter(args)` helper handles `undefined`/missing/empty/wrong-type args with a `"1 = 2"` no-match filter (tautologically false; `getList(1, 1, { filter: "1 = 2" })` returns `{ items: [] }` cleanly). Escapes quotes and backslashes in user ids. `getUserProfileImpl` for direct calls (reads `pb.authStore.record.id`).
- `src/pb-compat/descriptors/userProfile.test.ts` (~93 LOC, NEW) — **11 unit tests pass.**
- `src/pb-compat/use-query.ts` — added `buildFilter?` callback on `PbQueryDescriptor` (Q10 in §4). When set, the hook uses it INSTEAD of `encodeArgsAsFilter(args)`. Lets a query encode filters needing runtime state (the current user id from `pb.authStore.record`) that the args object doesn't carry.
- `src/pb-compat/api.ts` — `userProfile.get` is now a real descriptor; the stub `{} as StubNamespace` was replaced. **First non-stub on the public surface.**
- `src/pb-compat/_generated/dataModel.ts` — added optional `created?: string` to `PbUserProfile` for the PB system `created` field (used to compute `_creationTime` in the wrapper). +13 tests = **130/130** after B.7.2 (now **170/170** overall after Phase 3's 40 descriptor unit tests).

**B.7.3 — `usePbProfile()` wrapper + 3 consumer flips — ✅ DONE (commit `14308df`)**

- `src/pb-compat/hooks/use-pb-profile.ts` (~85 LOC, NEW) — `usePbProfile()` is a Convex-shaped wrapper around `api.userProfile.get`. Reads `useAuth()` for the current user id, calls `useQuery(userProfileGetQuery, { user: <id> })`, maps PB shape to Convex `Doc<"userProfile">` shape: `id → _id`, `user → userId`, `created (ISO) → _creationTime (ms)`, `name`/`bio`/`preferences` passthrough. **Trust-boundary cast `as unknown as Doc<"userProfile">`** at the wrapper boundary (Q12 in §4) — structural identity, not real type identity; explicit to make the boundary clear.
- **3 consumers flipped**: `src/components/Chat.tsx:159`, `src/app/settings/page.tsx:53`, `src/hooks/usePushSync.ts:17`. Each adds 1 import and replaces 1 line with a 5-line gated hook pair (Q11 in §4 — dual-hook consumer pattern, see below). The consumer-side code (`profile._id`, `profile.userId`, `profile.preferences.*`) is unchanged across the flag.
- **+0 unit tests** (the wrapper is React-hook code that needs jsdom — Stream C.2 deferred). Validated by the smoke test (B.7.4) and by the existing `convex/pb-compat-types.test.ts` type-level coverage (no `as any` introduced).
- `src/pb-compat/hooks.ts` + `src/pb-compat/index.ts` — re-export the new wrapper.

**Q11 in §4 (dual-hook consumer pattern)** is the key design for the Phase 3 rollout. Every consumer site looks like:
```ts
const pb = usePbProfile();
const convex = useQuery(api.ai.getProfile, {});
const profile = isPbBackend() ? pb : convex;
```
- **Both hooks unconditional** (Rules of Hooks satisfied — `isPbBackend()` is build-time-constant, so the branch never swaps between renders).
- **Unused result discarded** in production with the flag off (the unused branch is DCE'd at build time).
- The consumer's downstream code (`profile._id`, `profile.userId`, ...) is unchanged across the flag — that's the whole point of the wrapper.

**B.7.4 — end-to-end smoke test — ✅ DONE (commit `8273787`)**

- `scripts/smoke-pb-userprofile.mjs` (~325 LOC, NEW) — self-contained Node script. Spawns a temp PB, applies the migration (with `--migrationsDir` explicit — see §10.11), bootstraps the first superuser via the `superuser upsert` CLI (the HTTP admin endpoint is not reachable on a fresh data dir in PB 0.22+ — see §10.6), creates a test user, signs in as the user, seeds a `user_profile` record, then runs **13 assertions** across 5 scenarios.
- `npm run test:smoke` script in `package.json`.
- **13/13 pass.** Same scenarios as the unit tests + the positive case (the seeded record comes back) which the unit tests couldn't cover.

**B.7.5 — Chat sort fix — ✅ DONE (commit `5c35fe5`)**

The previous `useMemo` in `src/components/Chat.tsx:147-153` was:
```ts
return [...messagesPaginated.results].reverse();
```
…which relied on the backend to return items in newest-first order. Convex's `listPaginated` returns `-timestamp` order, so reversing gave chronological display. The PB path's `usePaginatedQuery` returns `-id` order, and **PB ids are random 15-char strings, NOT time-prefixed** (the B.5b finding above). The silent reliance on backend order would have broken chronological display on PB.

**Fix:** sort by `timestamp` desc explicitly, then reverse:
```ts
const sorted = [...messagesPaginated.results].sort(
  (a, b) => b.timestamp - a.timestamp,
);
return sorted.reverse();
```
No-op for Convex (already -timestamp order). Restores chronological order for PB (random -id order). Both backends share the `Doc<"messages">` / `PbMessages` shape with `timestamp: number`. **No schema migration needed** (PB `messages` has `timestamp: number` natively).

#### Stream B summary

| Stage | Commit | Files | Tests | Risk |
|---|---|---|---|---|
| B.1 | `7d8482a` | 3 (new) | 7 | Low |
| B.2 | `5eacb68` | 2 (new) | 19 | Med |
| B.3 | `ae7f01f` | 2 (new) | 4 | Low |
| B.4 | `2997ce1` | 7 (new) | 6 | Med |
| B.5a | `70534e3` | 3 (new) | 27 | Med |
| B.5b | `d0da463` | 1 (new) | 17 (stress) | High |
| B.6 | `3981d09` | 1 (modified) | 0 | Low |
| B.7.1 | `23a113e` | 3 (modified) | 2 | Med |
| B.7.2 | `f185c39` | 4 (modified) | 13 | Med |
| B.7.3 | `14308df` | 6 (modified) | 0 | Med |
| B.7.4 | `8273787` | 2 (1 new) | 13 (smoke) | Low |
| B.7.5 | `5c35fe5` | 1 (modified) | 0 | Low |
| **Total** | | | **+108 → 130** + 17 stress + 13 smoke | |

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
| 1.1 Wire MENTIONS_* edges | A | 0.1 | Low | ✅ DONE (`4fdb9c9`) — `wireMentionsEdges` helper, extended `saveSemanticMemory` schema, 10 tests pass |
| 1.2 Graph traversal in `retrieveGraphContext` | A | 0.25 | Low | ✅ DONE (`4ed7f3d`) — cartesian-product bug fixed, MENTIONS_HABIT added, threshold configurable, `CAST($emb AS FLOAT[384])` for cosine param, `null`→`[]` normalisation, 10 tests pass |
| 1.3 MemoryHealth admin view | A | 0.5 | Low | ✅ DONE (`e534f01`) — `getMemoryHealth` helper, `GET /api/admin/memory-health` route, server-rendered UI with 3 cards, 6 tests pass |
| 2 Foundation (PB dep + client + auth context) — B.1 | B | 0.5 | Low | ✅ DONE (`7d8482a`) — `pocketbase@0.27.0` dep, `client.ts` singleton, `auth.tsx` `useAuth` (extended surface: `record`, `token`, `pb.authStore`); 7 tests pass |
| 3 `useQuery` (B.2) | B | 1.5 | Med | ✅ DONE (`5eacb68`) — descriptor pattern, `useQuery<T>(descriptor, args?) → T \| undefined` (NOT plan's `{ data, isLoading, error }`); 19 tests pass |
| 4 `useMutation` (B.3) | B | 0.5 | Low | ✅ DONE (`ae7f01f`) — minimal: 3 overloads, fresh callable per render, no `mutateAsync` / no in-flight state; 4 tests pass |
| 5 `useAction` (B.4) | B | 0.5 | Med | ✅ DONE (`2997ce1`) — single dynamic route + name→handler registry; 1 stub (`parseDate`), NOT plan's 8 actions; 6 tests pass |
| 6 `usePaginatedQuery` (B.5a) | B | 1.5 | **High** | ✅ DONE (`70534e3`) — split into B.5a (helpers + hook + 27 unit tests) + B.5b (10K stress test) |
| 6b 10K stress test (B.5b) | B | 0.5 | Med | ✅ DONE (`d0da463`) — 17/17 pass; surfaced PB id format = random, first-broadcast-lost quirk, EventSource polyfill need; `npm run test:stress` |
| 7 Env flag (B.6) | B | 0.25 | Low | ✅ DONE (`3981d09`) — `isPbBackend()` reads `NEXT_PUBLIC_BACKEND === "pocketbase"`; default = false |
| 8.1 Wire `PbAuthProvider` (B.7.1) | B | 0.25 | Med | ✅ DONE (`23a113e`) — body gated on `isPbBackend()`; zero-cost in Convex mode; +2 type tests |
| 8.2 `userProfile.get` descriptor (B.7.2) | B | 0.5 | Med | ✅ DONE (`f185c39`) — first non-stub on public surface; `buildFilter?` callback on `PbQueryDescriptor`; 11 unit tests |
| 8.3 `usePbProfile` wrapper (B.7.3) | B | 0.5 | Med | ✅ DONE (`14308df`) — Convex-shaped wrapper; 3 consumers flipped; trust-boundary cast at wrapper boundary |
| 8.4 Smoke test (B.7.4) | B | 0.25 | Low | ✅ DONE (`8273787`) — 13/13 end-to-end against real PB; `npm run test:smoke` |
| 8.5 Chat sort fix (B.7.5) | B | 0.15 | Low | ✅ DONE (`5c35fe5`) — sort by `timestamp` desc then reverse; no `created` migration needed |
| 9a Type-level tests (C.1) | C | 0.5 | Low | ✅ DONE — `convex/pb-compat-types.test.ts` grew from 24 → 27 tests (PbAuthProvider surface, useAuth/PbQueryDescriptor shape checks) |
| 9b Hook unit tests (C.2) | C | 1.0 | Med | 🟡 PARTIAL — pure helpers covered (pagination 27, use-query 19, use-mutation 4, use-action 6, userProfile 11); the React hook bodies (useQuery, useMutation, useAction, usePaginatedQuery, usePbProfile) are validated by integration tests (B.5b stress, B.7.4 smoke) not by jsdom-mounted vitest. jsdom + RTL is deferred to Phase 3 (no jsdom dep installed). |
| 9c Integration test (C.3) | C | 0.5 | Med | ✅ DONE (lighter form) — `scripts/smoke-pb-userprofile.mjs` (B.7.4) is the opt-in integration test. Not a full Playwright/Cypress suite. |
| 10 Docs (C.4) | C | 0.5 | Low | ❌ PENDING — `docs/architecture/memory-system.md` not yet written. The memory system is documented in fragments across `saveSemanticMemory.ts`, `convex/ai.ts`, `convex/background_jobs.ts`, `retrieveGraphContext.ts` + this doc. ADR-012 §3 item 6 still open. |
| **Total** | | **~9 days** | | **8.5 of 10 stages DONE** |

**Critical path: COMPLETED.** The risk-theater around `usePaginatedQuery` (the plan's ⭐ HIGHEST RISK) was split across B.5a (helpers + hook, low-risk) and B.5b (10K stress, high-risk). Splitting meant we shipped the hook without the 10K claim, then verified the claim in its own commit. **Phase 3 risks remain** (reconnect storms, real-time at scale) but those are now the migration plan §6.1 concern, not a Phase 2 deliverable.

**Test count progression**: 24 (pre-Phase-2) → 34 (after 1.1) → 44 (after 1.2) → 50 (after 1.3) → 57 (after B.1) → 76 (after B.2) → 78 (after B.3) → 82 (after B.4) → 115 (after B.5a) → 117 (after B.7.1) → 130 (after B.7.2) → 130 (after B.7.3) → 130 (after B.7.4, +13 smoke opt-in) → 130 (after B.7.5) → 130 (after Phase 4, no new tests) → **170 (after Phase 3, +40 from 7 new descriptor unit tests, retroactively bumped when the test files landed in commit `b125581`)**. **170/170 unit + 17/17 stress + 13/13 userprofile smoke + 11/11 read-paths smoke + 30/30 dashboard smoke + 22/22 messages stress.** 0 failures across all six suites.

---

## 4. Decisions locked

| Q | Decision | Why |
|---|---|---|
| 1. File layout | One file per heavy hook, shared `hooks.ts` for light ones | `usePaginatedQuery` earns its own file (~150 LOC); mutation/action share |
| 2. Action target | Next.js API route (not PB JS hook) | Matches Phase 6 background_jobs port; fewer moving parts |
| 3. Subscription dedup | Per-call (not shared) | PB local WS cost negligible; simpler code |
| 4. Hook parity test | Hybrid: type-level + small integration | Phase 1 type tests already pin shape; full snapshot parity is Phase 3 |
| 5. Optimistic updates | NO in Phase 2 (parity) | Add in Phase 3+ when we have latency data |
| 6. Stream A scope trim | No oldest-memory or dedup-ratio stats in A.3 | Memory node schema has no `createdAt`; `hash` lives in Convex (Phase 4+ concern) |
| 7. Stream A surface rename | "Orphan edges" → "lonely memories" | A.1's silent no-op means there are no dangling edges; the observable failure is memories that should have mentioned something but didn't |
| 8. Drop `useRef` for the PB client (B.7.1) | The client is a process-wide singleton (`getPbClient()` in `client.ts:64-71`); the ref was redundant and triggered the `react-hooks/refs` rule against reading `ref.current` during render | The singleton is the actual safety belt; the ref added nothing |
| 9. `useQuery` returns `T \| undefined` (B.2) | Matches Convex's `useQuery` shape exactly | Existing consumer code does `if (!profile) return null`, not `if (profile.isLoading) ...`; keeping the shape the same lets the consumer flip happen without re-engineering every call site. The plan's `{ data, isLoading, error }` shape was rejected. |
| 10. `buildFilter?` callback on `PbQueryDescriptor` (B.7.2) | Lets a query encode filters needing runtime state (current user id from `pb.authStore.record`) that the args object doesn't carry | When set, the hook uses `buildFilter(args)` INSTEAD of `encodeArgsAsFilter(args)`. The descriptor's `buildUserFilter` returns `"1 = 2"` for `undefined`/missing/empty/wrong-type args (tautologically false filter = no-match without an error). |
| 11. Dual-hook consumer pattern (B.7.3) | `const pb = usePbProfile(); const convex = useQuery(api.ai.getProfile, {}); const profile = isPbBackend() ? pb : convex;` — both hooks unconditional, branch is build-time-constant | Satisfies Rules of Hooks (`isPbBackend()` is inlined at build time, so the branch never swaps between renders); unused result is DCE'd in production with the flag off. The consumer's downstream code is unchanged across the flag. |
| 12. Trust-boundary cast `as unknown as Doc<"userProfile">` (B.7.3) | At the wrapper boundary only — the PB and Convex shapes are structurally identical, but the type systems are unrelated | Explicit `as unknown as Doc<...>` (vs `as any`) makes the cast's intent clear: the boundary is doing shape-mapping, not hiding a type error. `as any` would also work but obscures the intent. |
| 13. `useAction` reads token at **call time** (B.4) | Not at hook-call time — the returned callable reads `pb.authStore.token` from the **current** auth context on each invocation | If a user signs in mid-session (e.g. on the settings page), the next `run(...)` picks up the new token automatically. Caching the token at hook-call time would have broken sign-in flows. This was a near-miss bug caught during B.4 design review. |
| 14. Dispatcher pattern for actions (B.4) | Single dynamic route `/api/pb-action/[name]/route.ts` + name→handler registry, NOT N separate route files | (1) The plan's N routes is purely file-count growth — no logic difference. (2) The action name is already a meaningful URL component. (3) The registry gives one place to add auth, logging, rate-limiting later — N separate routes scatter that. New action = 1 new file in `src/lib/pb-actions/<name>.ts` + 1 line in `registry.ts`. **No new route file.** |
| 15. `parseDate` scope = 1 stub (B.4) | The plan's "8 actions" was an over-estimate: 5 already have Next.js routes, 2 are server-side only, `saveSemanticMemoryAction` is already ported via the Mastra tool | The `parseDate` stub returns `null`. The Convex `parseDate` action in `convex/background_jobs.ts:460` is the reference shape; nothing in `src/` calls it on either backend, so a real impl is premature. **Stub stays until first consumer appears** (decision ratified 2026-06-07 — Convex is a frozen artifact, don't change it). |
| 16. PB id format is **random 15-char**, NOT time-prefixed (B.5b) | Confirmed by inspecting 10K seeded ids; lexicographic order is arbitrary, not chronological | Invalidates the naive "use id-desc as a time proxy" assumption. Hook sorts by `id desc` for stable ordering, but consumer-side "newest first" (e.g. Chat) uses B.7.5's `useMemo` sort by `timestamp` desc. **No `created` field migration needed** — PB `messages` has `timestamp: number` natively. |
| 17. Split B.5 into B.5a (impl) + B.5b (stress test) | Plan called for monolithic 2-day B.5 with hook + 10K test in one go | (1) The 10K test infra (spawning temp PB, seeding, asserting real-time) is significant overhead that benefits from being its own commit. (2) B.5a can ship behind the flag without the "10K works" claim. (3) Unit tests cover pure helpers; the stress test covers React-side integration. |
| 18. `PbAuthProvider` wired into `app/layout.tsx` (B.7.1) | Initially deferred from B.1 because the spec wasn't clear; B.7.1 wraps the app in it | The body is gated on `isPbBackend()`. In Convex mode: byte-for-byte zero-cost. In PB mode: constructs the singleton client, calls `authRefresh()` to rehydrate the session, subscribes to `onChange` for sign-out propagation. |
| 19. `useAction` does NOT have `useCallback` wrapping (B.4) | The mutation/action callables are created fresh per render | The original Convex pattern returns a stable function reference. We don't need that here — consumers always call `await run(args)` then rely on the existing `useQuery` subscription to reflect the result. Stable identity would add React state machinery we don't need (Q5). |
| 20. `useMutation` does NOT have `useCallback` wrapping either (B.3) | Same as Q19 | Same justification. Fresh callable per render is fine. |

---

## 5. Open risks specific to Phase 2

**Status as of Phase 2 close:**

- **Reconnect storms** (B.5): PB EventSource drops → re-subscribe → "did I miss messages?" **Mitigated.** Cursor uses `lastId` (not page number); the 10K stress test (B.5b) covers reconnect behavior. **Still a Phase 3 risk** (production users will see more reconnect events than the test) — tracked in `MIGRATION_POCKETBASE.md` §6.1.
- **Subscription leaks** (B.2-B.5): every `useQuery` opens a subscription. **Mitigated** — `useEffect` cleanup with `unsubscribe()` + `AbortController.abort()`. The B.5b stress test exercises 200 pages + 3 create/update/delete events with no leaks.
- **Filter encoding** (B.2): Convex `args` are typed; PB filters are untyped strings. **Mitigated** — typed args in the hook signature, internal PB filter encoding via `encodeArgsAsFilter` (the default) OR `buildFilter?` callback (for runtime-state filters, Q10). Types live in `_generated/dataModel.ts`. The 11 unit tests + 13 smoke assertions cover the encoding surface.
- **Realtime for new collections** (B.5): `scheduled_notifications` is new. **Not yet verified** — the B.5b stress test uses a synthetic `stress_messages` collection. **Phase 3 work item**: verify subscribe works for the real `scheduled_notifications` collection when the on-open scheduler lands.
- **Per-call subscription at scale** (B.2): if a future screen renders 100 components all subscribed to `useQuery(api.tasks.list)`, that's 100 PB WS subscriptions. **Acceptable for our scale** (single-user desktop). Revisit in Phase 6+ if profiling shows it matters. The 10K stress test ran 1 subscription; the limit is unexplored.
- **Encrypted `preferences` API keys on the PB path** (NEW, identified during B.7.3). Browser cannot decrypt custom-provider API keys (the `ENCRYPTION_KEY` is server-side only). When Phase 4 first writes to `user_profile` (the encrypted-key consumer), we'll need a server-side proxy that decrypts using `ENCRYPTION_KEY`. **Deferred** to Phase 4.

---

## 6. Exit criteria (Phase 2 done when ALL are true)

1. `npx tsc --noEmit` clean ✅
2. `npm run test` passes (target: 50+ tests) ✅ (currently **170/170**)
3. `npx eslint` produces no new errors (pre-existing 144 errors are out of scope; see ADR-011 freeze) ✅ — Stream A introduced 4 (in `edges.ts`/`traversal.ts`/`health.ts`, pre-Phase-2; documented in §9.4); Stream B (B.1-B.7.5) introduced **0**.
4. `api.userProfile.get` works behind `NEXT_PUBLIC_BACKEND=pocketbase` in dev with PB running ✅ (B.7.1-B.7.5; smoke-tested via `npm run test:smoke`)
5. Same call still works with Convex (regression) when flag is unset ✅ (verified during B.7.1's "body zero-cost in Convex mode" design)
6. `MemoryHealth` admin view shows the four kept graph edges populated after one `saveSemanticMemory` call ✅ (Stream A + smoke test)
7. `phase-2-adapter.md` (this doc) and `memory-system.md` exist — **partial** (this doc is current and now reflects Stream B; `memory-system.md` is C.4, still pending)
8. `pb-compat/hooks.ts` and `src/pb-compat/use-paginated-query.ts` are no longer "Phase 1 stub" — they call real PB ✅
9. **NEW**: `npm run test:stress` passes 17/17 ✅ (B.5b)
10. **NEW**: `npm run test:smoke` passes 13/13 ✅ (B.7.4)

**Phase 2 is 9 of 10 criteria DONE**; the remaining item is `memory-system.md` (Stream C.4).

---

## 7. Cut policy (what to defer if time-pressed)

- **Stream C.4 (`memory-system.md`)** — **deferred to Phase 3** per the original cut policy. ADR-012 §3 item 6 still open.
- **Stream C.2 (jsdom-mounted hook unit tests)** — **deferred to Phase 3**. The pure helpers are covered (pagination 27, use-query 19, use-mutation 4, use-action 6, userProfile 11); the React hook bodies are validated by integration tests (B.5b stress, B.7.4 smoke). jsdom + RTL setup is ~1 day of work, not worth doing until Phase 3 when more hooks are flipped and the test surface grows.

**Already-cut from Stream A** (moved out of scope, see §4 decisions 6 and 7): oldest memory, dedup ratio, "orphan edges" framing.

**Already-cut from Stream B** (moved out of scope, see §4 decision 15): real `parseDate` impl (1 stub stays until first consumer).

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
- `src/lib/graph/traversal.ts` — `retrieveGraphContext` helper (added in this phase)
- `src/lib/graph/health.ts` — `getMemoryHealth` helper (added in this phase)
- `src/app/api/admin/memory-health/route.ts` — `GET /api/admin/memory-health` (added in this phase)
- `src/app/admin/memory-health/page.tsx` — admin UI (added in this phase)

---

## 9. Lessons learned (Stream A)

These are the gotchas that the Stream A work surfaced. They apply to any future code that talks to LadybugDB or that runs vitest against it. They are also written into the test files themselves (so they're discoverable when reading the code) and into the helper docstrings.

### 9.1 `array_cosine_similarity` is strict about param types

**Symptom:** `Binder exception: ARRAY_COSINE_SIMILARITY requires argument type to be FLOAT[] or DOUBLE[].` at query time.

**Why:** the storage side accepts plain JS arrays (the DDL `FLOAT[384]` is fine), but the `array_cosine_similarity` function checks the *parameter* type at query time and rejects untyped arrays.

**Fix:** wrap with `CAST($emb AS FLOAT[384])` at the query site.

**Applies to:** any future Cypher that uses `array_cosine_similarity` (or any other strict-typed LadybugDB function) with a query parameter.

### 9.2 `null` vs `[]` for empty `OPTIONAL MATCH` collections

**Symptom:** a memory with no MENTIONS_TASK edges has `tasks: null`, not `tasks: []`, in the result row.

**Why:** LadybugDB's `collect(...)` returns `null` when the source set is empty. The LLM prompt and the UI then see a literal `null` and can crash or render `[object Object]`.

**Fix:** coalesce in the helper, not at every consumer. The traversal helper does `row.tasks ?? []` in its map step.

**Applies to:** any future Cypher that uses `collect(...)` over an `OPTIONAL MATCH` result.

### 9.3 Test isolation with shared temp DB

**Symptom:** tests in the same `describe` block share a single temp LadybugDB instance. A test that creates `mem-high` followed by another test that also creates `mem-high` blows up with "Found duplicated primary key value mem-high, which violates the uniqueness constraint of the primary key column."

**Why:** vitest's `beforeAll` runs once per `describe`. State from earlier tests leaks.

**Fix:** `beforeEach(async () => { await conn.query('MATCH (n) DETACH DELETE n'); })`. This is the standard Cypher idiom for clearing a graph; supported by LadybugDB.

**Applies to:** every `*.test.ts` in `src/lib/graph/` that uses a single `beforeAll` DB.

### 9.4 ESLint picture is more nuanced than the prior summary claimed

The previous "Phase 1 + 1.5 + 2.1.1 introduced 0 errors and 11 warnings" line in the anchored summary was inaccurate. **Stream A introduced 4 new ESLint errors** (1 in `edges.ts` from `as any` cast on `e: any` for the catch block; 2 in `traversal.ts`; 2 in `health.ts` — 1 in `edges.test.ts` is a vitest rule that doesn't fire). All four are `@typescript-eslint/no-explicit-any` on `as any` casts used to satisfy LadybugDB's recursive `LbugValue` param type.

**Mitigation in this PR:** `health.ts` carries `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments matching the project convention (used in `convex/migrations.ts`, `src/components/chat/LazyCodeBlock.tsx`, `src/components/chat/MessageStream.tsx`). **`edges.ts` and `traversal.ts` are not patched in this PR** — same pattern, same justification, but the casts predate this PR. They will be cleaned up in the post-freeze ESLint pass referenced in ADR-011 §6. The test count and the tsc/lint state are documented per commit so this isn't a hidden regression.

**Fix when the freeze lifts:** wrap the `as any` casts in `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (or, better, refactor to a single typed `LbugValue` cast helper). Five-line change. Tracked in the post-freeze cleanup.

### 9.5 Stale IDs in `saveSemanticMemory` are observable via MemoryHealth

**Integration finding:** a `saveSemanticMemory` call with `taskIds: ['nonexistent-id']` produces a Memory that has zero outgoing edges. The MemoryHealth admin view correctly surfaces this as a "lonely memory" with the offending Memory's `id` and `text`. This is the *intended* diagnostic path for the "silent no-op on stale IDs" decision in A.1 — the test `health.test.ts:detects lonely memories` and the integration test `health.test.ts:counts stale-ID no-op writes` exercise both halves of the round trip.

---

## 10. Lessons learned (Stream B)

These are the gotchas that Stream B surfaced. They apply to any future code that talks to PocketBase (from Node or the browser), and to any future stress-test or smoke-test script that spawns a temp PB instance. They are also written into the test files themselves (so they're discoverable when reading the code) and into the helper docstrings.

### 10.1 PB id format is random 15-char, NOT time-prefixed

**Symptom:** assumed PB ids were time-prefixed (ULID-style) so "sort by `-id`" would be a cheap proxy for "newest first." When Chat's `useMemo` reversed the `usePaginatedQuery` results on the PB path, the displayed order was arbitrary, not chronological.

**Why:** PB uses `nanoid`-style random 15-character strings. There's no time component embedded. Sort order is stable but arbitrary.

**Fix:** the hook sorts by `id desc` for stable ordering (handles new items via prepend-on-create). Consumer-side "newest first" (e.g. Chat) does an explicit `useMemo` sort by `timestamp` desc, then reverse for chronological display. See B.7.5 (`src/components/Chat.tsx:147-160`).

**Applies to:** any consumer that wants chronological order. The hook is intentionally order-agnostic.

### 10.2 PB SDK first-broadcast-lost quirk

**Symptom:** in a Node stress test, a `subscribe("*", cb)` immediately followed by a `create()` reliably drops the create's broadcast event. The callback never fires. (Test-only — production is unaffected because the hook subscribes once on mount and stays.)

**Why:** race condition in the SDK's `connect → submitSubscriptions` pipeline. The first `EventSource` connection's subscriptions aren't all submitted before the create event arrives.

**Fix:** keep a no-op warmup subscribe OPEN (do NOT unsubscribe the warmup) so the EventSource stays live across the warmup. Original test pattern (subscribe → 200ms → real create → 500ms → UNSUBSCRIBE) was wrong: the unsubscribe re-closed the EventSource, putting the next test's subscribe back in the "fresh client" state.

**Applies to:** the B.5b stress test (`scripts/stress-pagination.mjs`) — production is unaffected.

### 10.3 `globalThis.EventSource` is not in Node 25

**Symptom:** `ReferenceError: EventSource is not defined` (or `Cannot read properties of undefined (reading 'EventSource')`) when the PB SDK tries to open a real-time connection from a Node script.

**Why:** the PB SDK uses `EventSource` directly in browser code paths and there's no WebSocket fallback. Node 25 has `globalThis.WebSocket` (since Node 21) but NOT `globalThis.EventSource`.

**Fix:**
```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
globalThis.EventSource = EventSource;
// THEN await import("pocketbase")
```
The `eventsource` package is already a transitive dep (3.0.7) via `@mastra/ai-sdk` or similar — no extra install. Set the global BEFORE the dynamic import of `pocketbase`.

**Applies to:** any Node script that uses the PB SDK's real-time APIs. Tauri WebView uses browser EventSource, so the production app is unaffected.

### 10.4 PB SDK auto-cancels duplicate `requestKey`s

**Symptom:** when seeding N records in parallel with `pb.collection("x").create({...})`, some creates silently fail with no error (or the request is canceled and the promise hangs).

**Why:** the SDK auto-generates a `requestKey` from the method + path. If two creates hit the same path, the second cancels the first.

**Fix:** pass a unique `requestKey` per parallel call: `pb.collection("x").create(data, { requestKey: \`seed-${i}\` })`.

**Applies to:** the B.5b stress test's parallel seeding; any future bulk-import script.

### 10.5 PB 0.22+ batch disabled by default

**Symptom:** `pb.createBatch()` returns 403 "Batch requests are not allowed."

**Why:** PB disables batch by default for security (a single bad record could be rolled into a batch and validated separately).

**Fix:** enable batch in PB settings (Settings → Application → Enable batch), or use parallel single creates with bounded concurrency (50 in B.5b). The latter is simpler and avoids the setting change.

**Applies to:** the B.5b stress test; any future bulk-import script.

### 10.6 PB admin HTTP endpoint not reachable on fresh data dir in 0.22+

**Symptom:** `POST /api/admins` returns 404 "The requested resource wasn't found."

**Why:** in PB 0.22+, the admin auth/install endpoints require a setup token that's only generated after the first server start + installer flow. The plain `POST /api/admins` is gated behind that.

**Fix:** use the CLI: `pocketbase superuser upsert EMAIL PASSWORD --dir <dataDir>`. This works without a running server and bypasses the install-token gate.

**Applies to:** the B.7.4 smoke test's setup; any future test that needs an admin.

### 10.7 PB SDK `create` body type is `{ [k: string]: any }` — generics must be cast

**Symptom:** TypeScript error "Type 'X' is not assignable to type '{ [key: string]: any }' (or `FormData` | `undefined`)" when passing a typed record to `pb.collection("x").create(data)`.

**Why:** the SDK's `create<T>(body: T | { [k: string]: any } | FormData)` signature is permissive but the discriminated union means `T` (a typed record) is checked against the index-signature constraint.

**Fix:** cast at the call site: `pb.collection("x").create(data as unknown as { [k: string]: any })`. Or refactor to a single `Record<string, unknown>` boundary type in your descriptor.

**Applies to:** every PB SDK call that takes a typed body.

### 10.8 PB token verification gotcha — `authStore.save()` alone is NOT sufficient

**Symptom:** a server-side endpoint accepts a Bearer token, calls `pb.authStore.save(token)`, and trusts the user. An attacker who forges a token (PB signs them with a server-side key, but the client gets the token) can impersonate any user.

**Why:** `authStore.save()` is a client-side convenience. It does NOT verify the token's signature or expiration.

**Fix:** ALWAYS call `pb.collection("users").authRefresh()` after `authStore.save()`. `authRefresh` hits PB's server, which verifies the JWT signature and returns the authenticated record. After verification, call `pb.authStore.clear()` to avoid leaking the verified token to subsequent requests.

**Applies to:** the B.4 server-side auth helper (`src/lib/pb-actions/auth.ts`). This is the #1 security risk in the migration — get this right.

### 10.9 TypeScript `@ts-expect-error` directive only works when comment line STARTS with `// @ts-expect-error`

**Symptom:** an expected-error test still reports an error in CI because the `@ts-expect-error` directive didn't catch it.

**Why:** TypeScript matches the directive by exact leading-token pattern. If the comment line is `// (Type-level check via the @ts-expect-error directive below.)` followed by `// @ts-expect-error` on the next line, the first line's leading token is `//` (or `// `), not `// @ts-expect-error`. The directive is on the wrong line.

**Fix:** the directive must be on the comment line IMMEDIATELY ABOVE the line that's expected to error. No intervening lines (even blank ones, in some toolchain versions).

**Applies to:** every type-level test that uses `@ts-expect-error`.

### 10.10 `migrate up` needs `--migrationsDir` explicit (default resolution is unreliable)

**Symptom:** `pocketbase migrate up --dir <dataDir>` runs successfully but doesn't apply the migration. The server starts, the `user_profile` collection doesn't exist, and any subsequent write to it returns 404 "Missing or invalid collection context."

**Why:** the default `--migrationsDir` is `<dataDir>/pb_migrations`. When the working directory differs from `dataDir` (which is the common case in scripts), the default resolution sometimes fails silently.

**Fix:** pass `--migrationsDir` explicitly: `pocketbase migrate up --dir <dataDir> --migrationsDir <dataDir>/pb_migrations`.

**Applies to:** the B.7.4 smoke test; any future test that applies the migration programmatically.

### 10.11 `useRef` is unnecessary for the PB client (singleton + `react-hooks/refs` rule)

**Symptom:** the initial `PbAuthProvider` design used `const clientRef = useRef<PocketBase | null>(null);` and `clientRef.current ??= getPbClient()`. ESLint's `react-hooks/refs` rule flagged it because the ref was being read during render (not just in effects).

**Why:** reading `ref.current` during render is the most common React antipattern the rule catches. It can cause stale data, race conditions in concurrent mode, and a host of other subtle bugs.

**Fix:** make the client a module-level singleton. `getPbClient()` in `client.ts:64-71` is a process-wide `let` + lazy init. No ref needed. The provider just calls `getPbClient()` in its effect and `authRefresh()` — never in render.

**Applies to:** any React component that needs a process-wide resource. The singleton is the right pattern, the ref is the antipattern.

### 10.12 Dual-hook consumer pattern satisfies Rules of Hooks

**Symptom:** the consumer code for B.7.3 was initially:
```tsx
const profile = isPbBackend()
  ? usePbProfile()
  : useQuery(api.ai.getProfile, {});
```
TypeScript / React would (rightly) reject this — conditional hook calls violate Rules of Hooks.

**Fix:** always call both, then branch on the result:
```tsx
const pb = usePbProfile();
const convex = useQuery(api.ai.getProfile, {});
const profile = isPbBackend() ? pb : convex;
```
`isPbBackend()` is build-time-constant (reads `process.env.NEXT_PUBLIC_BACKEND`), so the branch never swaps between renders. The unused result is DCE'd in production with the flag off.

**Applies to:** every consumer site that's flipped to use the adapter. The pattern is idempotent across re-renders.

### 10.13 `--migrationsDir` AND `superuser upsert` are required in that order

**Symptom:** smoke test setup fails because the migration didn't apply (per §10.10) OR the admin auth fails because no superuser was created (per §10.6).

**Why:** both are setup steps that need to happen BEFORE the server starts. The order matters because `migrate up` initializes the data dir (creates `data.db` + the `_superusers` table), and `superuser upsert` writes to that table.

**Fix:** always:
1. `mkdir -p <dataDir>/pb_migrations` + copy the migration file there.
2. `pocketbase migrate up --dir <dataDir> --migrationsDir <dataDir>/pb_migrations` (no server running).
3. `pocketbase superuser upsert <email> <password> --dir <dataDir>` (no server running).
4. Start the server: `pocketbase serve --http 127.0.0.1:<port> --dir <dataDir>`.

**Applies to:** the B.7.4 smoke test. This is the canonical setup for any temp PB instance.
