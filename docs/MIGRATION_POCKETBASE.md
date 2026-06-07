# Dialogue → PocketBase Migration Plan

> **Status**: Draft. Living document — update as decisions are made and phases complete.
> **Last updated**: 2026-06-07 (rev 2: Phase 0/1/1.5 marked done; ADR-012 reflected; graph decision resolved; size target corrected; Phase 4 collapse to ~1-2 days re-confirmed)
> **Scope**: Replace the Convex backend with a self-hosted, Tauri-packaged stack. End-user install becomes a single desktop binary.
>
> **Source of truth**:
> - **`README.md`** is the end-goal source of truth (product positioning, agentic capabilities, target architecture, install story). Read it first.
> - This document is the technical roadmap to reach that end goal. It is downstream of the README — when the two disagree, the README wins.

---

## 1. Goal & Non-Goals

### Goal
Replace Convex with PocketBase as the primary backend, packaged inside a Tauri desktop app. The end-user install becomes one binary download. The companion's data lives on the user's machine. Relationship continuity is preserved through the migration.

### Non-Goals
- Multi-tenant SaaS. Dialogue stays a personal companion, one user per install.
- A web app. The desktop wrapper is the canonical install. (A future PWA is possible but not in scope.)
- Real-time multi-device collaboration. Single-user, single-device-primary.
- Re-architecting the agent layer. Mastra stays.
- Re-keying historical data. New installs start clean. Existing Convex data is junk/test data and is deleted at cutover. No historical import script (the only user is the developer; no valuable data to import).

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri shell (Rust) — single binary                        │
│                                                             │
│  On startup:                                                │
│    1. Extract PB + Node to the app data dir                 │
│       (`%APPDATA%/Dialogue/` on Windows,                    │
│        `~/Library/Application Support/Dialogue/` on macOS,  │
│        `~/.config/Dialogue/` on Linux)                      │
│    2. Set APP_URL=http://localhost:3000 (auto)              │
│    3. Set DESKTOP_MODE=true (auto)                          │
│    4. Spawn PocketBase (localhost:8090)                     │
│    5. Spawn Next.js (localhost:3000)                        │
│       └── Loads Xenova once at startup                      │
│    6. Wait for both ports, open webview                     │
│                                                             │
│  Background (own thread):                                   │
│    - On every 60s tick + on app open:                       │
│      scan PB.scheduled_notifications for dueAt<=now         │
│      fire Tauri OS notification, mark firedAt               │
│    - System tray icon for unread notifications              │
│                                                             │
│  Shutdown:                                                  │
│    - Kill child processes cleanly                            │
│    - PB saves pb_data, LadybugDB saves .dialogue-graph       │
└─────────────────────────────────────────────────────────────┘
```

**Process responsibilities:**

| Process | Owns |
|---|---|
| Tauri shell (Rust) | Lifecycle, system tray, OS notifications, on-open reminder scan, port coordination, child process management |
| PocketBase (Go binary) | Primary DB, reactive subscriptions (SSE), auth, file storage, JS hooks |
| Next.js (Node) | UI, Mastra agent, Xenova embeddings, chat API route, LadybugDB endpoint, OCEAN/reflection jobs |
| LadybugDB (in-process) | Vector search (384d cosine), graph store for memories |

---

## 3. Key Decisions

### 3.1 Embeddings run server-side, not browser-side

**What:** Xenova loads in the Node process spawned by Tauri. The browser/webview never loads it. The `/api/embeddings` route stays.

**Why:**
- In a Tauri app, the "browser" and the Node process are on the same machine. There is no privacy boundary between them.
- Loading Xenova twice (Node + webview) is pure waste: ~120MB RAM, two init cycles.
- The Node process is always running while the app is open. `/api/embeddings` is a fast localhost call.
- The vision's "runs entirely in your device" claim is satisfied: Xenova runs on the user's machine, just inside Node.

**When this changes:** A future PWA build (if it ships) will need a browser-side Xenova loader as a fallback. The server-side version stays for the desktop build.

**Implication for the recent commit (0484cc6):** Keep as-is. The dimension unification, `/api/embeddings` route, `APP_URL` env var, and 384d length assertions are all correct. The Tauri shell will auto-set `APP_URL` so users never see it.

### 3.2 No always-on scheduler. All periodic work is on-open.

**What:** The 7 Convex cron jobs disappear. The Tauri Rust process owns a small in-memory reminder queue, plus a `scheduled_notifications` table in PB. On app open and every 60s while running, it scans for `dueAt<=now AND firedAt=null`, fires Tauri OS notifications, marks `firedAt`.

**Why:** Dialogue runs on a local device that may not be on 24/7. A scheduler that requires the backend to be awake when the user isn't is wrong for this product. The vision explicitly says "synthesis happens on app open, not on a server schedule."

**What this means for the 7 crons:**

| Old cron | New behavior |
|---|---|
| `daily-session-summary` (hourly) | On app open, generate today's summary if missing. |
| `weekly-ocean` (Mondays :05) | On app open, if local day is Monday and digest missing, generate. |
| `weekly-reflection` (Mondays :15) | On app open, if local day is Monday and reflection missing, generate. |
| `monthly-ocean` (1st @ 00:05 UTC) | On app open, if local day is 1st and monthly digest missing, generate. |
| `monthly-reflection` (1st @ 00:10 UTC) | On app open, if local day is 1st and reflection missing, generate. |
| `daily-habit-reminders` (20:00 UTC) | On app open, if any habit not logged today, show habit reminder card. |
| `yearly-reflection` (Dec 27–30) | On app open, if local date is in that window and yearly missing, generate. |

**What about task/event reminders (`scheduledNotificationId`)?** Same model: store `dueAt` in `scheduled_notifications`, fire on next app open. Loses exact-time precision, gains offline + sleep resilience. Acceptable for the relationship product.

**What you give up:** Reminders won't fire if the user never opens the app. That's the cost of local-first. Worth it.

### 3.3 Push: Tauri OS notifications now, VAPID for future PWA

**What:** Tauri OS notifications replace browser VAPID in the desktop app. The recent VAPID key rotation, `pushSubscriptions` table, and `push_actions.ts` stay in the codebase but are gated by a `DESKTOP_MODE` env var.

**Why:**
- In the Tauri app, the webview is always open (in the tray). The "tab is closed" scenario doesn't apply.
- Tauri OS notifications are richer (system tray, native dialogs, action buttons) and don't require a third-party push service.
- Keeping VAPID code dormant means a future PWA build lights it up with zero code changes.

**Implication:** The Tauri shell auto-sets `DESKTOP_MODE=true`. The PB JS hooks check this and skip the web-push path. The VAPID subscription flow stays usable for a future PWA.

### 3.4 Vector search stays in LadybugDB

**What:** The single Convex `vectorSearch` call moves to a LadybugDB query. `retrieveGraphContext.ts` (which already does brute-force cosine search in LadybugDB) is unchanged.

**Why:**
- Brute-force 384d cosine search is fast at personal scale (sub-50ms for 10K memories).
- No new binary. PocketBase + Node + Tauri is already enough.
- The graph layer is underused today. The migration is the right time to either populate edges or delete the aspirational schema.

**When this changes:** If you ever ship multi-tenant or hit >50K memories per user, swap in a real vector index (Qdrant, sqlite-vec). Until then, brute-force is fine.

### 3.5 Graph layer decision: populate Memory edges, drop aspirational rest

**Decision (resolved in Phase 1, see `docs/migration/phase-1-graph-decision.md`):** Keep all 7 node tables; populate 4 of the 10 edge types in the same code path that writes Memory nodes; delete the other 6 aspirational edge types.

**Kept edges (4):**
- `RELATES_TO` — Memory → Memory (similarity or temporal connection)
- `MENTIONS_TASK` — Memory → Task
- `MENTIONS_EVENT` — Memory → Event
- `MENTIONS_HABIT` — Memory → Habit

**Deleted edges (6):** see `phase-1-graph-decision.md` for the full enumeration (`BLOCKED_BY`, `SCHEDULED_BEFORE`, `ASSIGNED_TO`, `OWNS`, `PARTICIPATED_IN`, and one more).

**Why keep Memory edges:** they make `retrieveGraphContext` actually useful — one tool call can expand from a matched memory to its `RELATES_TO` neighbors and its `MENTIONS_*` entities, instead of separate queries. The graph is the *unique* feature of "relationship-first AI"; a flat observation log cannot do this. See [ADR-012 §4.1](decisions/012-custom-memory-system-over-mastra-memory.md) for the full rationale.

### 3.6 Auth: PocketBase native, drop @convex-dev/auth

**What:** Replace `@convex-dev/auth` (JWT + OIDC + JWKS) with PocketBase's built-in email/password auth. Drop the OIDC discovery endpoint and JWKS route entirely.

**Why:** PocketBase auth is simpler (session token, no OIDC), works out of the box, and matches the current provider surface (password only — no OAuth, no magic link).

**Implication:** The `convex/auth.ts`, `convex/auth.config.ts`, and `convex/http.ts` (which only adds auth routes) all become obsolete. The 4 auth tables (`users`, `authSessions`, `authAccounts`, `authRefreshTokens`) fold into PocketBase's built-in `users` collection with custom fields.

### 3.7 Encryption stays the same, re-encrypted on import

**What:** The `ENCRYPTION_KEY` env var and the AES-256-GCM helper in `convex/encryption.ts` move to a standalone Node module (e.g. `src/lib/crypto/apiKeys.ts`). The encryption key can either be the same (re-encrypt on import with the new key) or rotated (force user re-entry of API keys).

**Why:** Custom provider API keys in `userProfile.preferences.customConfigs` are sensitive and need encryption-at-rest. PB has no equivalent helper.

**Decision (resolved 2026-06-07):** No historical data to re-encrypt. The user is the only user; existing Convex data is junk/test data and is deleted at cutover. The new PB key is the only key from day 1. If the user later wants to add custom provider keys, they're encrypted with the new key on first save. No re-encrypt script needed.

---

## 4. What Stays, What Goes, What Changes

### Stays unchanged
- **LadybugDB** — `src/lib/graph/ladybug.ts`, `src/lib/graph/embedding.ts`, `src/mastra/tools/retrieveGraphContext.ts`, `src/mastra/tools/deleteSemanticMemory.ts`
- **384d dimension contract** — schema, length assertions, embedding pipeline
- **LadybugDB dual-write** for memory saves (PB → LadybugDB mirror)
- **Mastra agent** — `src/mastra/agents/dialogueAgent.ts`, tool dispatch logic
- **Xenova / multilingual-e5-small** — model choice, pooling, normalization
- **Encryption helper logic** — algorithm, IV format, ciphertext format
- **`/api/embeddings` route** — server-side, localhost-only in Tauri context
- **`/api/graph/memory` route** — LadybugDB write path
- **All UI components** — `src/components/Chat.tsx`, panels, modals, dashboard cards
- **VAPID code** — dormant, gated by `DESKTOP_MODE`, ready for future PWA

### Goes (obsolete after migration)
- **`convex/` directory** — all 28 files
- **`@convex-dev/auth`** — replaced by PocketBase auth
- **OIDC + JWKS** — PocketBase has its own session model
- **Convex storage (`_storage`)** — replaced by PocketBase file fields
- **`ENCRYPTION_KEY` re-encryption ceremony** — *not needed*: no historical data to re-key; new PB key is the only key from day 1
- **`src/lib/convex-server.ts`** — `convexServerClient` and `requestContext` go away
- **`useQuery` / `useMutation` / `useAction`** — replaced by a PocketBase reactive hook
- **`usePaginatedQuery`** — replaced by a custom hook with cursor + `initialNumItems` parity
- **`api.*` imports** — replaced by a generated PB types module
- **`Id<"...">` / `Doc<"...">` types** — replaced by a PB types module
- **Single-tenant "first user" hacks** — `saveMemoryBackendSync`, `getSystemProfileContext`, `getSearchConfig` get fixed for multi-tenant PB

### Changes
- **7 cron jobs** → on-open checks in Tauri process
- **Convex actions (`saveSemanticMemoryAction`, `parseDate`)** → PB JS hooks or Next.js API routes
- **Convex scheduled work** → `scheduled_notifications` PB table + Tauri scan
- **Web push delivery** → Tauri OS notifications (when `DESKTOP_MODE=true`)
- **Per-user timezone math** → moves from Convex actions to the on-open check, runs in the Tauri process or Next.js startup
- **Background_jobs.ts orchestration chain** → 36+ `ctx.runQuery/Mutation/Action` calls become HTTP calls between Next.js and PB (Node process and PB process are both on the user's machine)
- **`PageCustomizer.tsx` storage URL** — `${CONVEX_SITE_URL}/api/storage?id=...` → `${PB_URL}/api/files/...`

---

## 5. Phased Plan

Rough effort estimates. Each phase is independently shippable.

**Phase status (2026-06-07):**

| Phase | Status | Notes |
|---|---|---|
| 0 — Tauri skeleton | ✅ Done | `phase-0-tauri-skeleton.md` |
| 1 — Schema mapping + graph decision | ✅ Done | `phase-1-schema-mapping.md`, `phase-1-graph-decision.md`; `pb-compat/` stubs landed |
| 1.5 — PB migration end-to-end verification | ✅ Done | `phase-1-5-pb-verification.md`; 117/117 checks pass |
| 2 — `pb-compat/` adapter | Pending | First step: wire `MENTIONS_*` edges per ADR-012 |
| 3 — Read paths | Pending | |
| 4 — Flip write paths | Pending | No migration script; ~1-2 days |
| 5 — Realtime + dashboard cards | Pending | Highest risk |
| 6 — Background jobs | Pending | Second-highest risk |
| 7 — On-open scheduler | Pending | |
| 8 — File storage + public share | Pending | |
| 9 — Tests + e2e + cutover | Pending | |

### Phase 0: Tauri skeleton (~1-2 weeks) — ✅ DONE
- Set up Tauri shell that spawns the existing Next.js dev server.
- Configure system tray, OS notification API, on-open hooks.
- Verify Xenova loads in the spawned Node process, `/api/embeddings` is reachable.
- Set `APP_URL=http://localhost:3000` and `DESKTOP_MODE=true` automatically in the Tauri shell.
- **License audit**: confirm no GPL3/AGPL transitive dependencies ship in the Tauri distribution (per the licensing policy in [ADR-011 §2.4](decisions/011-feature-freeze-during-pb-migration.md)). Produce `docs/migration/phase-0-license-audit.md` with one row per transitive dep and a license column. Any GPL3/AGPL finding is a Phase 0 blocker.
- **Deliverable:** a `.dmg` that, when double-clicked, opens the existing Dialogue app in a Tauri window. No backend changes yet. Convex still works.

### Phase 1: Schema mapping + decision on graph layer (~1 week) — ✅ DONE
- Map every Convex table to a PocketBase collection (19 tables).
- Decide on graph layer: populate edges or delete aspirational schema. (See 3.5.)
- Generate TypeScript types from PB schema (replaces `Id<"...">` / `Doc<"...">`).
- **Deliverable:** a `pb_migrations/` directory with collection definitions, no app code changes yet.
- *(See `docs/migration/phase-1-schema-mapping.md` and `docs/migration/phase-1-graph-decision.md`. `src/pb-compat/_generated/dataModel.ts` carries the hand-written types. `src/pb-compat/api.ts` + `hooks.ts` + `index.ts` are the Phase-1 stub. `convex/pb-compat-types.test.ts` is the type-level test (21/21 pass). `npx tsc --noEmit` clean, `npm run test` 24/24 pass.)*

### Phase 1.5: PocketBase migration end-to-end verification (~half day) — ✅ DONE
- Install PocketBase 0.39.1 Windows binary (`C:\Users\user\tools\pocketbase\pocketbase.exe`).
- Discover and fix PB 0.22+ JSVM API gotchas (App not Dao, plain object field configs, 2-pass for self-refs).
- Write `scripts/verify-pb-migration.mjs` — end-to-end verifier: 117 checks across 10 categories.
- **Deliverable:** 117/117 checks pass. Migration is idempotent (down/up re-passes). PB schema is locked.
- *(See `docs/migration/phase-1-5-pb-verification.md`. Migration file: `pb_migrations/1700000000_init_collections.js`.)*

### Phase 2: Build the `pb-compat/` adapter layer (~1-2 weeks)
- A thin module that exposes the same `api.*` surface that the client code uses, but is backed by PocketBase.
- `useQuery` → a custom hook wrapping `pb.collection(...).subscribe('*', ...)` with reactive updates.
- `useMutation` → a thin wrapper around `pb.collection(...).create/update/delete`.
- `useAction` → a thin wrapper around PB JS hooks or Next.js API routes.
- `usePaginatedQuery` → custom hook with cursor + `initialNumItems` parity (highest-risk item in this phase).
- `Id<"X">` / `Doc<"X">` → generated types from PB schema.
- **Mastra 1.0 memory is NOT adopted.** Per [ADR-012](decisions/012-custom-memory-system-over-mastra-memory.md), the custom memory system (`saveSemanticMemory` + `retrieveGraphContext` + LadybugDB vector+graph + 384d Xenova local) is retained and refined per the §3 roadmap in that ADR. **Phase 2 first step:** wire `MENTIONS_TASK/EVENT/HABIT` edges in `saveSemanticMemory` (~1-2h, additive, ~25 LOC). Then add graph traversal to `retrieveGraphContext`. Then add the `MemoryHealth` admin view.
- **Deliverable:** client code can swap `from "convex/_generated/api"` for `from "pb-compat/api"` with no other changes. The custom memory pipeline is unchanged, but the four kept graph edges are now actually populated. The Phase-1 stub hooks are replaced with real PB-backed hooks. Convex still works in parallel.

### Phase 3: Migrate read paths behind a flag (~1 week)
- Flip the adapter for read-only paths first: profile, workspaces, sessions, personas, tasks list, events list, habits list.
- Run both backends in parallel. PB is `dryRun: true` (writes logged but not committed). Convex is source of truth.
- Diff results nightly. Catch any semantic mismatches.
- **Deliverable:** dashboard renders identically when reading from PB. Convex still serves the data.

### Phase 4: Flip write paths to PB (no historical migration) (~1-2 days)
- Flip mutations to PB. Convex becomes `dryRun: true` (writes logged but not committed).
- **No historical data migration.** User is the only user; existing Convex data is test/debug junk and is deleted at cutover. The new PB DB starts empty.
- **No re-encrypt script.** Custom provider API keys (if any exist post-cutover) are encrypted with the new PB key on first save. No legacy data to re-key.
- Drop `convexServerClient` and `requestContext` from Mastra tools.
- Optional safety net (only if you want a rollback path during the cutover week): dual-write new records to both Convex and PB for the first 7 days, then drop the Convex side.
- **Deliverable:** all new writes go to PB. Convex becomes a frozen snapshot of junk that gets deleted in Phase 9.

### Phase 5: Migrate chat realtime + dashboard cards (~1 week)
- Highest-risk UI surface: `usePaginatedQuery` for messages, 6 `useQuery` calls in `Chat.tsx`, dashboard proactive cards.
- Verify cursor pagination parity.
- Verify WebSocket subscription reconnect behavior (Convex WebSocket vs PB WebSocket — both use WS, but reconnect semantics differ).
- **Deliverable:** chat works identically on PB. Realtime updates flow over WebSocket.

### Phase 6: Migrate background jobs (LLM orchestration) (~1-2 weeks)
- Port `convex/background_jobs.ts` to either PB JS hooks or Next.js API routes.
- The 36+ cross-function call chain becomes HTTP calls between Next.js and PB.
- Update Mastra tools: 22+ `getConvexClient().query|mutation(api.X, args)` calls → `pb.collection(...).getList/getOne/create/update/delete`.
- Update `/api/chat/route.ts` per-request auth plumbing.
- **Deliverable:** all 8 internal actions work on PB. Mastra agent makes correct calls.

### Phase 7: Build the on-open scheduler + reminders (~3-5 days)
- Add `scheduled_notifications` table to PB schema.
- Tauri Rust process: on app open + every 60s, scan for `dueAt<=now AND firedAt=null`, fire OS notification, mark `firedAt`.
- Port the 7 cron-equivalent on-open checks.
- Port task/event reminder scheduling (move from Convex scheduler to `scheduled_notifications` table).
- **Deliverable:** all reminders and periodic work run on-app-open. No `crons.ts` equivalent needed.

### Phase 8: File storage + public share (~3-5 days)
- Replace Convex `_storage` with PB file fields on `userImages` and `messages.attachments`.
- Update `PageCustomizer.tsx` to use PB file URLs.
- Verify `getPublicReflection` (no-auth public read) works in PB.
- **Deliverable:** images and chat attachments work identically. Public share links still work.

### Phase 9: Tests + e2e + cutover (~1 week)
- Port `convex/memory.test.ts` to a PB test harness.
- E2E tests for chat, tasks, events, habits, memories, OCEAN, reflections.
- One-time data import script (Convex → PB) for any existing users.
- Delete `convex/` directory.
- Update README, AGENTS.md, `.env.example`.
- **Deliverable:** Convex is fully replaced. The app runs end-to-end on Tauri + PB + Node + LadybugDB.

**Total rough effort: 4-8 weeks** of one senior engineer, full-time (revised 2026-06-07 after Phase 4 collapsed to ~1-2 days per `33f8e79`). Still leans longer given Phase 5 (realtime) and Phase 6 (orchestration chain) risk.

---

## 6. Risks

### 6.1 `usePaginatedQuery` parity (Phase 5)
**Risk:** PB SSE subscriptions don't have a direct equivalent of Convex's `usePaginatedQuery(initialNumItems, ...)`. Cursor-based pagination + initial-page hydration needs custom plumbing.
**Mitigation:** Build a `usePaginatedQuery`-shaped hook on top of PB `getList(page, perPage)`. Test with realistic message volumes (10K+ messages) before declaring parity.

### 6.2 Cross-function call chain in `background_jobs.ts` (Phase 6)
**Risk:** The 36+ `ctx.runQuery/Mutation/Action` calls in `background_jobs.ts` rely on in-process atomicity. HTTP calls between Next.js and PB don't have the same guarantee.
**Mitigation:** Identify which chains are truly atomic (e.g. "save memory + write graph mirror") and use PB transactions for those. Accept eventual consistency for chains that don't need it (e.g. "generate reflection → write stats → show UI").

### 6.3 ~~Encryption key rotation during import (Phase 4)~~
**Status (2026-06-07):** Not applicable. User is the only user; no historical API keys to re-encrypt. New keys (if any) are encrypted with the new PB key on first save. **Removed from risk register.**

### 6.4 Tauri WebView differences
**Risk:** WebKit (macOS), WebView2 (Windows), WebKitGTK (Linux) have subtle differences. Realtime (PB uses **WebSocket** under the hood for `pb.collection().subscribe()`, not SSE — correction from earlier draft) may behave differently across platforms.
**Status (2026-06-07):** Phase 0 verified on Windows only. macOS/Linux verification still pending. Don't ship until realtime works reliably on all three.
**Mitigation:** Test on all three platforms before Phase 5.

### 6.5 LadybugDB native module bundling
**Risk:** LadybugDB is a native Node module. Tauri-spawned Node processes need to find it on disk. May need to vendor it into the Tauri distribution.
**Status (2026-06-07):** Verified in Phase 0 — LadybugDB loads correctly in the Tauri-spawned Node process via the existing `src/lib/graph/ladybug.ts` singleton. **Resolved.**

### 6.6 First-run latency
**Risk:** Cold-start of Xenova model takes 1-2s. Plus PB startup, Next.js startup, Tauri shell startup. Total: 3-5s.
**Mitigation:** Show a splash screen with progress indicators. Tauri can show the window with a "starting..." message while the children boot. Acceptable for a desktop app.

### 6.7 VAPID code rot (Phase 7)
**Risk:** VAPID code sits dormant. When PWA ships, will it still work? `web-push` library, VAPID keys, subscription table — all may have drifted.
**Mitigation:** Add a VAPID smoke test in CI that runs against a mock push service. Catch rot before it matters.

---

## 7. Cutover Strategy

### Adapter layer pattern

`src/pb-compat/` exposes the same `api.*` surface that the client code uses, but is backed by PocketBase. A single env var (`NEXT_PUBLIC_BACKEND=pocketbase`) selects which backend the adapter talks to. Both backends can run in parallel during the migration.

```
client code (useQuery, useMutation, ...)
       │
       ├── if NEXT_PUBLIC_BACKEND=convex → ConvexHttpClient (current)
       │
       └── if NEXT_PUBLIC_BACKEND=pocketbase → pb-compat adapter
                                                    │
                                                    ├── PocketBase SDK
                                                    ├── Next.js API routes for embeddings
                                                    └── LadybugDB for vector search
```

### Migration order

1. **Read paths first** (Phase 3). Reads are low-risk. Diff against Convex in CI.
2. **Write paths second** (Phase 4). Writes are reversible during dry-run.
3. **Realtime last** (Phase 5). This is the highest-risk surface.
4. **Background jobs after** (Phase 6). The LLM chain depends on read/write paths being stable.
5. **Scheduler and reminders** (Phase 7). Depends on PB schema being stable.
6. **Cutover** (Phase 9). Flip the env var, run for a week, delete Convex.

### Dark launch

For one week before cutover:
- Both backends run on every request.
- Convex is `dryRun: true` (writes logged, not committed).
- PB is `dryRun: false` (real writes).
- A nightly job diffs Convex logs against PB state. Catches silent mismatches.

### Rollback

If PB goes wrong during cutover:
- Flip `NEXT_PUBLIC_BACKEND=convex`. Convex is still the source of truth.
- New writes since the last PB export are lost (or recoverable from the dry-run log).
- Document the rollback procedure in the runbook.

---

## 8. Open Questions

These need to be resolved before the corresponding phase starts.

1. ~~**Phase 1: Graph layer — populate or delete?**~~ **Resolved 2026-06-07:** see §3.5. 4 keep / 6 delete. Decision doc: `docs/migration/phase-1-graph-decision.md`.

2. ~~**Phase 0: Tauri vs Electron.**~~ **Resolved:** Tauri. Confirmed in Phase 0.

3. ~~**Phase 4: Encryption key strategy on import.**~~ **Resolved 2026-06-07:** no historical data; new PB key is the only key from day 1. No re-encrypt script needed.

4. **Phase 2: Adapter vs clean replacement.** Adapter layer (slow but safe, recommended) or clean replacement (faster if it works, no rollback). Confirm.

5. ~~**Phase 7: VAPID handling.**~~ **Resolved:** keep dormant. Future PWA lights it up.

6. ~~**Phase 9: Migration of live user data.**~~ **Resolved 2026-06-07:** no historical migration. The only user starts fresh on PB. No import script. PB's `dialogue.db` starts empty.

7. ~~**Phase 5: SSE vs WebSocket.**~~ **Resolved 2026-06-07:** PB uses **WebSocket** under the hood for `pb.collection().subscribe()` (not SSE — earlier draft was inaccurate). Disconnect/reconnect + event ordering + cursor pagination remain the highest-risk items in Phase 5. Test plan: synthetic 10K-message session, verify reconnect storm, verify no out-of-order events.

8. **Phase 2/5: User-provided secret store for the desktop app.** OS keychain (`keyring` crate, recommended) vs encrypted local file (PB-derived key). Decide before Phase 5 (Tauri spawning + child process env injection).

9. **Phase 9: App size target.** README currently says "~15MB Tauri binary." Realistic estimate is ~150-200 MB unoptimized, ~100-120 MB with Bun + smaller embedding model. README and AGENTS.md need revision. (The 15 MB target is unachievable without ripping out Node + the embedding model + the chat UX.)

10. **Phase 2/9: Convex↔Next.js env parity.** During the freeze, secrets live in 2 places: `.env.local` (Next.js) + Convex dashboard. The 2-place situation is a footgun. `scripts/check-env-parity.mjs` would diff them and warn on missing keys. ~1-2h of work. The 2-place situation disappears in Phase 9 (Convex is gone), so this is freeze-time-only. Worth it?

---

## 9. Living Document

This doc is the high-level source of truth. Update it when:
- A phase starts or completes (flip its status, add notes).
- A new decision is made (add to §3, link from §8).
- A new risk surfaces (add to §6).
- A scope change is requested (update §1).

**Do not** let file-by-file implementation details creep in. If a specific file mapping is needed, link to it from a separate doc under `docs/migration/`.

**File-level artifacts:**
- `docs/migration/phase-0-tauri-skeleton.md` — ✅ Tauri setup specifics (done)
- `docs/migration/phase-0-license-audit.md` — *pending* — transitive dependency license audit (ADR-011 §2.4)
- `docs/migration/phase-1-schema-mapping.md` — ✅ PB collection definitions (done)
- `docs/migration/phase-1-graph-decision.md` — ✅ Graph layer decision: 4 keep / 6 delete (done)
- `docs/migration/phase-1-5-pb-verification.md` — ✅ 117/117 schema checks pass (done)
- `docs/migration/phase-2-adapter.md` — *pending* — `pb-compat/` API surface; refinement roadmap from ADR-012 §3
- `docs/migration/phase-4-cutover.md` — *pending* — flip write paths to PB; no migration scripts, no re-encrypt
- `docs/migration/cutover-runbook.md` — *pending* — step-by-step cutover + rollback
- `docs/architecture/memory-system.md` — *pending* — single end-to-end doc of the custom memory system (ADR-012 §3 item 6)

---

## 10. Related Documents

- `docs/decisions/010-dynamic-agent-memory-architecture-and-gemini-embedding-migration.md` — Xenova 384d embedding pipeline
- `docs/decisions/011-feature-freeze-during-pb-migration.md` — Feature freeze policy (this plan is the work it governs)
- `docs/decisions/012-custom-memory-system-over-mastra-memory.md` — Explicit decline of Mastra memory; refinement roadmap
- `docs/future-impl/transformers_js_embedding.md` — Xenova implementation reference
- `convex/AGENTS.md` — Convex-specific guidelines (will become obsolete after Phase 9)
- `AGENTS.md` — repo-level guidelines (will need a Tauri section added; the `~15MB` Tauri binary target is unachievable — see §8 open question 9)
- `README.md` — install instructions (will need to be rewritten for Tauri; `~15MB` target needs revision per §8 open question 9)
