// =============================================================================
// Feature-flag check. Single source of truth for "is the PB backend active".
//
// Phase 1: always returns false. Phase 2 enables the flag for the feature-flag
// rollout (Phase 3 per migration plan §5).
// =============================================================================

export function isPbBackend(): boolean {
  // PocketBase is now the default backend.
  // Set NEXT_PUBLIC_BACKEND=convex to temporarily opt out.
  return process.env.NEXT_PUBLIC_BACKEND !== "convex";
}

// =============================================================================
// Phase status. Used by tests and the migration doc to verify the surface.
//
// Phases 2-5 are done: hooks B.1-B.5a (useAuth, useQuery, useMutation,
// useAction, usePaginatedQuery) are real; descriptors + dispatcher +
// 13 mutation hooks + 8 dashboard unified queries are wired behind
// `isPbBackend()`; chat realtime + dashboard subscriptions + 5.1-5.4
// fixes are all in. Realtime accepts the documented reconnect gap;
// USE_SPLIT_PROACTIVE_STATE is forced true in PB mode.
// =============================================================================

export const PB_COMPAT_PHASE = 5 as const;
export const PB_COMPAT_STATUS = "done" as const;
