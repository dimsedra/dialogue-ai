# Phase 5: Realtime + Dashboard Cards — Lessons Learned

**Status:** ✅ Done (5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 + habits migration fix all in).

Phase 5 covered the highest-risk UI surface of the PB migration: the chat realtime (1 `usePaginatedQuery` for messages + 6 `useQuery` calls in `Chat.tsx`) and the dashboard proactive cards (9 dual-queries, 8 unified descriptor queries). The plumbing for both was already done by the end of Phase 4 — Phase 5 was mostly validation, plus a few targeted fixes.

This doc captures the 6+ lessons that emerged, in roughly the order they were discovered.

---

## 1. The "first event lost" race in PB SDK realtime

**Symptom**: After a fresh `pb.collection(name).subscribe("*", cb)`, the very first broadcast event on that collection is reliably dropped. Subsequent events fire fine.

**Root cause**: Race in the SDK's connect→submitSubscriptions pipeline. When you subscribe, the SDK opens the WebSocket and registers subscriptions with the server, but the first event that arrives on the wire can be processed before the subscription registration is acknowledged.

**Fix**: Pre-warm the WebSocket connection by subscribing with a no-op listener FIRST, then firing a no-op mutation to consume the first-broadcast-lost slot. The warmup subscribe stays open (do NOT unsubscribe it) so the EventSource keeps streaming.

**Pattern**:

```js
// 1. Open the no-op warmup subscribe, do NOT unsubscribe it
const _warmupUnsub = await pb.collection(coll).subscribe("*", () => {});

// 2. Fire a create + delete to consume the first-broadcast-lost slot
const warm = await pb.collection(coll).create({ ... });
await pb.collection(coll).delete(warm.id);

// 3. NOW open the real subscribes — they will fire reliably
const realUnsub = await pb.collection(coll).subscribe("*", realHandler);
```

**Where it applies**: Any test or production code that subscribes to PB and immediately fires a mutation. In production this is fine because the production hook subscribes once on mount and stays there for the app's lifetime — no race. In tests it's a constant gotcha.

**Phase 5 tests affected**: B.5b's `stress-pagination.mjs`, Phase 5.2's `stress-pb-messages.mjs`, Phase 5.3's `smoke-pb-dashboard.mjs` (one warmup per collection before the 8 dashboard subscribes).

---

## 2. PB `validation_required` treats `0` / `false` / `{}` as "blank"

**Symptom**: Creating a record with `currentStreak: 0` (or `completed: false`, or `frequencyConfig: {}`) fails with `"Cannot be blank"` even though the value is semantically valid.

**Root cause**: PB's `validation_required` field rule treats "zero-equivalent" values (number 0, boolean false, empty object `{}`) as blank, not as a present-but-zero value. This is consistent with how the rule treats `null` and `undefined` as missing.

**Fix**: Set `required: false` on the field, then have the application layer default the value if it's absent. For example, the `usePbHabitCreate` hook (`src/pb-compat/hooks/use-pb-habit-mutations.ts:111-112`) explicitly passes `currentStreak: 0, longestStreak: 0` when creating a habit.

**Migration fields that need `required: false`** (Phase 3 + commit `6be9ea4`):

- `tasks.completed`, `tasks.archived` (Phase 3)
- `habits.archived`, `habits.frequencyConfig` (Phase 3)
- `notifications.read`, `notifications.delivered` (Phase 3)
- **`habits.currentStreak`, `habits.longestStreak`** (5.3 → commit `6be9ea4`) — the `0`-is-blank case for number fields

**Lesson**: Any field whose "natural zero value" is meaningful (`count = 0`, `progress = 0%`, `streak = 0`, `enabled = false`) should be `required: false` in the PB migration, with the default enforced in the application layer.

---

## 3. PB SDK Node import: default export, not namespace

**Symptom**: `const { PocketBase } = await import("pocketbase")` gives a function-shaped but non-constructable namespace export. `new PocketBase(url)` throws `TypeError: PocketBase is not a constructor`.

**Root cause**: The PB SDK 0.27.0 ships with the `default` export being the `PocketBase` class. The namespace export is a stub (or just the type). This is a CommonJS↔ESM interop quirk.

**Fix**:

```js
const { default: PocketBase } = await import("pocketbase");
// or, in CJS:
const { default: PocketBase } = require("pocketbase");
```

**Where it applies**: All test scripts (`stress-pagination.mjs`, `stress-pb-messages.mjs`, `smoke-pb-dashboard.mjs`, `smoke-pb-userprofile.mjs`, `smoke-pb-readpaths.mjs`, `verify-pb-migration.mjs`).

**Lesson**: Always destructure as `default` for the PB SDK. Also: PB SDK requires `globalThis.EventSource` to be polyfilled in Node — set it BEFORE the dynamic import so the SDK's class definition doesn't bake in `undefined`.

---

## 4. Reconnect gap: accept the loss (option a)

**Decision (locked 2026-06-07)**: When the PB WebSocket disconnects and reconnects, the hook re-subscribes but does NOT refetch. Events that occurred during the disconnect are lost; subsequent state eventually catches up via the next mutation.

**Why accepted**: For a single-user Tauri desktop app, the WebSocket runs over localhost. Disconnects are rare. The cost of a refetch-on-reconnect (re-running 8 dashboard queries + 1 paginated chat query + N Chat.tsx useQuery calls on every reconnect) is much higher than the cost of the occasional missed event.

**Alternative deferred**: Refetch-on-reconnect could be added later if real users report issues. The hook's subscribe lifecycle is already in place; adding a "re-fetch on subscribe" flag would be ~20 LOC.

**Where it applies**: `src/pb-compat/use-query.ts` (the `subscribe("*"...)` call at line 300+ doesn't refetch on reconnect; it just re-establishes the listener). Production code is fine; tests that simulate reconnects need to account for the gap.

---

## 5. The 15+ "subscription limit" concern was overestimated

**Prior claim** (from the migration plan): "15+ simultaneous PB WS subscriptions on Dashboard mount (9 dual-queries + ~5+ from Chat when on same page)".

**Reality**: The 8 Dashboard queries subscribe to 5 distinct collections (3 on `tasks`, 2 on `habits`, 1 each on `reflections`/`events`/`card_state`). The PB SDK dedupes EventSource connections per collection, so 8 `subscribe()` calls share **5 EventSources + 8 listeners**. There is no "15+ subscription limit" — the SDK handles this fine.

**What was validated** (Phase 5.3, `smoke-pb-dashboard.mjs`):
- 8 simultaneous subscriptions open + close cleanly
- 1 `tasks` create fires all 3 task listeners (multi-listener fanout)
- 1 `habits` create fires both habit listeners
- 1 `tasks` update fires all 3 task listeners
- A `users` collection mutation (not subscribed) does NOT fire any of the 8
- Per-update cost: each listener runs an independent `fetchAndSet` (1 getList per listener on the subscribed collection)

**Cost per write**: ~N getList calls (N = number of listeners on the affected collection). For Dashboard's 3 task listeners, that's 3 getList calls per task write. Acceptable for single-user scale.

**Lesson**: The "subscription limit" worry was unfounded. The actual concern is **listener fanout cost** (which scales with `useQuery` count per collection, not raw subscription count). For our scale (8 queries on 5 collections), this is fine.

---

## 6. `set-state-in-effect` from the new react-hooks rule

**Symptom**: ESLint warning `react-hooks/set-state-in-effect` on `src/pb-compat/use-query.ts:227` — `setData(undefined)` called synchronously inside the effect body when `args === "skip"`.

**Root cause**: The hook used to reset state synchronously inside the effect for the "skip" branch. The new react-hooks lint rule (eslint-plugin-react-hooks v6+) flags any synchronous setState in the effect body as a code smell — it can lead to cascading renders.

**Fix**: Don't reset state in the effect for "skip". Instead, derive the return value at the bottom of the hook:

```ts
useEffect(() => {
  if (args === "skip") return;  // <-- no setState here
  // ... fetch logic
}, [key, query]);

// When args === "skip", return undefined without touching state. The
// previous version called setData(undefined) synchronously inside the
// effect body, which trips react-hooks/set-state-in-effect. The state
// is preserved (last fetched value) in case args flips back to a real
// value — semantically equivalent for the consumer.
return args === "skip" ? undefined : data;
```

**Bonus**: This is actually a small improvement — the underlying state preserves the last fetched value, so if `args` flips back from "skip" to a real value, the hook can render the stale data immediately while the new fetch runs (no `undefined` flash).

**Where it applies**: `src/pb-compat/use-query.ts:223-229, 329-333` (commit `28aea19`).

---

## 7. Multi-listener fanout is the right model for dashboard subscriptions

**Insight**: PB's `subscribe("*", cb)` is at the **collection level**, not the query level. The SDK has no concept of "filter-scoped subscriptions" — you subscribe to a collection and filter client-side. This means:
- 3 dashboard queries that all read `tasks` share the same PB subscribe
- A `tasks` write fires all 3 listeners
- Each listener runs its own `fetchAndSet` with its own filter

**Cost**: 1 `tasks` write → 3 getList calls (1 per listener). For our scale this is fine. For 100+ listeners it would be a real problem.

**Why this is fine for Dialogue**: Single-user desktop. Worst case: Dashboard mount = 9 queries = ~3 distinct collections × 1-3 listeners = ~10 getList calls. Each `tasks` write fires 3 of them. Per-write cost: 3 getList calls. Per-paginated-chat-write cost: 1 getList (only 1 listener on `messages`). Acceptable.

**Lesson**: If the app ever goes multi-user, this fanout model will need to be revisited (e.g., per-user filter-scoped subscriptions, or server-side filter pushdown). For now, it's the right trade-off.

---

## 8. Auth-gated `listRule` returns empty (not 403)

**Discovery**: `listRule: "@request.auth.id != ''"` makes the unauthed client get an empty result set (0 items, totalItems=0) rather than a 401/403.

**Why it matters**: An attacker probing the API gets "this exists" or "this doesn't exist" as a free signal, but they can't exfiltrate data. For our use case (single-user desktop), it doesn't matter — the auth gate prevents any data from being returned without a valid token.

**Future-proofing**: If we ever expose the API publicly, we'd want a stricter 403 response. For now, the "empty result" behavior is fine and even arguably better for the desktop UX (the app doesn't have to distinguish "no auth" from "no records").

**Test impact**: The `smoke-pb-dashboard.mjs` T6 test accepts BOTH behaviors (empty result OR 403) via a try/catch, in case the SDK flips the behavior in a future version.

---

## 9. The Phase 5.1 `USE_SPLIT_PROACTIVE_STATE` guard

**Decision (locked 2026-06-07)**: In PB mode, force the flag to `true` rather than registering the legacy `getProactiveState` query on the PB API surface.

**Why**: The legacy query is monolithic (1 big function) and the 8 split queries are already implemented. Re-implementing the legacy query on PB would be ~30 LOC of throwaway code. Forcing the flag is ~5 LOC and documents the constraint.

**Implementation**:

```ts
// src/components/chat/Dashboard.tsx:41
const USE_SPLIT_PROACTIVE_STATE = isPbBackend() || true;
```

**Runtime behavior today**: Unchanged (the flag was already `true` for both backends). The guard is documentary + defensive — if the flag is ever made runtime-toggleable, PB mode will still stay on the split path.

**Where it applies**: The `pbApi.dashboard as any` cast at `Dashboard.tsx:238` is now unreachable in PB mode (the legacy hook gets `"skip"` from the `useQuery` and short-circuits in the effect before touching the descriptor), but the TS cast is still required for the type checker.

---

## 10. The "habits migration" bug — same root cause, missed in Phase 3

**Symptom**: A user creating their first habit with `currentStreak: 0` (the correct initial value) cannot save it through the API. PB's `validation_required` rejects `0` as "Cannot be blank".

**Root cause**: Same as lesson #2. The Phase 3 commit message said the refinement covered "boolean/JSON fields" but missed number=0. The `habits.currentStreak` and `habits.longestStreak` fields stayed `required: true`.

**Fix** (commit `6be9ea4`):
- Migration: `currentStreak` and `longestStreak` → `required: false` with a comment cross-referencing the boolean/JSON refinement.
- Hook: no change needed (was already passing `0` explicitly at `use-pb-habit-mutations.ts:111-112`).
- Smoke test: reverted the `1` workaround back to `0` so the test exercises the original bug case as a regression guard.

**Lesson**: When adding `required: false` to fields with a "zero is meaningful" semantic, audit ALL collections for the same pattern, not just the one in front of you. The Phase 3 audit missed `habits.currentStreak` / `longestStreak`. A simple grep `grep -n 'required: true' pb_migrations/*.js | grep -E 'number|bool|json'` would have caught it.

---

## Summary table

| # | Lesson | Impact | Where it lives |
|---|--------|--------|----------------|
| 1 | First event lost after fresh subscribe | Test reliability | All PB subscribe tests use warmup |
| 2 | PB `validation_required` treats 0/false/{} as blank | Migration correctness | `pb_migrations/1700000000_init_collections.js` |
| 3 | PB SDK default export, not namespace | Test infrastructure | All `scripts/*.mjs` |
| 4 | Reconnect gap: accept the loss | Realtime reliability | `use-query.ts` subscribe lifecycle |
| 5 | "15+ subscription limit" was overestimated | Architecture validation | `smoke-pb-dashboard.mjs` proves 8 simultaneous works |
| 6 | `set-state-in-effect` from new react-hooks rule | Code style | `use-query.ts:223-229, 329-333` |
| 7 | Multi-listener fanout is the right model | Architecture decision | `src/pb-compat/descriptors/dashboard.ts` (8 split queries) |
| 8 | Auth-gated `listRule` returns empty, not 403 | API behavior | PB migration access rules |
| 9 | `USE_SPLIT_PROACTIVE_STATE` forced true in PB mode | Code path simplification | `Dashboard.tsx:41` |
| 10 | Habits migration bug — same root cause, missed | Regression prevention | Migration `habits` collection + smoke test |

**Net effect of Phase 5**: Chat realtime + dashboard cards work end-to-end on PB. 246 tests pass across all suites (170 unit + 11 read smoke + 13 userprofile + 22 messages stress + 30 dashboard smoke). The hook design is sound. The remaining work is Phase 6 (background jobs, second-highest risk).
