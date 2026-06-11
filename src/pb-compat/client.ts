// PocketBase client singleton — Phase 2 Stage B.1.
//
// What this file does:
//   - Exposes `getPbClient()`, a process-wide singleton of the PocketBase SDK.
//   - Reads `NEXT_PUBLIC_PB_URL` (default `http://localhost:8090`).
//   - Caches the client across calls within the same Node process / browser
//     tab so consumers can import it freely without rebuilding the SDK on
//     every render or every API route invocation.
//
// Why a singleton?
//   - The PocketBase SDK holds an `authStore`, a `realtime` WebSocket, and
//     per-collection caches. We want one of each per process.
//   - In the Tauri-spawned Node process, the singleton is per-NODE.
//   - In the browser, the singleton is per-tab (the SDK keeps auth in
//     localStorage so a tab refresh rehydrates the same user).
//
// Why now?
//   - ADR-012 §3 items 1-3 are done; the custom memory system is in good
//     shape. The next step is the `pb-compat/` adapter that the rest of the
//     app will call when `NEXT_PUBLIC_BACKEND=pocketbase`. The client is the
//     foundation for that.
//
// Phase 2 safety: this file is gated by `isPbBackend()`. Hooks that consume
// the client (useQuery, useMutation, useAction, usePaginatedQuery, useAuth)
// live in B.2-B.5 and only activate when the env flag is flipped. The flag
// itself is still hard-coded to `false` in Phase 2 (see `index.ts`); it
// flips to a real env-var read in Stage B.6.
//
// Per-call subscription vs shared subscription (decision Q3 in
// `phase-2-adapter.md`): PB local WS cost is negligible for a single-user
// desktop app. Each hook will open its own subscription rather than share
// one — simpler code, easier to reason about, no dedup table to maintain.

import PocketBase from "pocketbase";

const DEFAULT_PB_URL = "http://127.0.0.1:8090";

/**
 * Resolves the PB server URL from the env. Order of precedence:
 *   1. `process.env.NEXT_PUBLIC_PB_URL` (Next.js public env, inlined at build
 *      time on the client; read directly on the server).
 *   2. `DEFAULT_PB_URL` (`http://localhost:8090` — matches the PB server we
 *      use in `scripts/verify-pb-migration.mjs`).
 *
 * The `NEXT_PUBLIC_` prefix means the value is exposed to the browser bundle.
 * That's intentional: the browser needs the URL to talk to PB. PB is local
 * (Tauri-spawned or dev), so the URL is not a secret.
 */
export function resolvePbUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_PB_URL;
  if (envUrl && envUrl.length > 0) return envUrl;
  return DEFAULT_PB_URL;
}

/**
 * Process-wide PocketBase client singleton. Idempotent: calling it twice
 * returns the same instance.
 *
 * Phase 2 is single-user. The SDK's per-process WebSocket pool and authStore
 * are safe to share. If we ever go multi-tenant (which we won't — see
 * ADR-011 §2.4 "no always-on infrastructure"), this would need per-user
 * isolation. Tracked in the post-freeze hardening list.
 */
let cachedClient: PocketBase | null = null;

export function getPbClient(): PocketBase {
  if (cachedClient === null) {
    cachedClient = new PocketBase(resolvePbUrl());
    cachedClient.autoCancellation(false);
  }
  return cachedClient;
}

/**
 * Test-only: reset the cached client so the next `getPbClient()` call
 * rebuilds. Used by `client.test.ts` to verify that `NEXT_PUBLIC_PB_URL` is
 * read on construction, not on first use. Not exported from `index.ts`.
 */
export function __resetPbClientForTests(): void {
  cachedClient = null;
}
