"use client";

// PocketBase auth context — Phase 2 Stage B.1.
//
// What this file does:
//   - Exposes `PbAuthProvider`, a React context provider that wraps the app
//     and tracks PB's auth state.
//   - Exposes `useAuth()`, a hook returning `PbAuthState` (the same shape
//     that was defined as a stub in `hooks.ts` Phase 1).
//   - On mount: tries `authRefresh()` to rehydrate the session from the SDK's
//     localStorage store. If the token is invalid/expired, the SDK clears
//     the store and the user becomes `null`.
//   - Subscribes to `pb.authStore.onChange()` so any sign-in / sign-out /
//     token refresh anywhere in the app re-renders consumers of `useAuth()`.
//
// Why now (not in Phase 1)?
//   - Phase 1 was deliberately stub-only. Adding the real PB client (B.1)
//     unblocks B.2-B.5 (useQuery, useMutation, useAction, usePaginatedQuery)
//     and the `useAuth` hook is needed by sign-in / sign-up / sign-out
//     flows, which the B.4 useAction wrapper will eventually call into.
//
// What this module does NOT do:
//   - No OAuth providers. PB supports Google/GitHub/etc. via
//     `pb.collection('users').authWithOAuth2()`; the surface for that lives
//     in a future B.x.
//   - No MFA. PB has OTP / TOTP support; same — future work.
//   - No refresh-on-stale. The SDK refreshes the JWT automatically on
//     authed requests; we don't need a manual timer.
//
// Phase 2 safety: this module is only ever imported by client code, and the
// `useAuth()` return shape matches the Phase 1 stub exactly. Code that
// currently checks `isPbBackend()` before calling useAuth continues to work.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPbClient } from "./client";
import type { PbAuthState } from "./hooks";
import type { PbRecord, PbUsers } from "./_generated/dataModel";

/**
 * Adapter: a PB auth record from `pb.authStore.record` is typed as
 * `RecordModel` (the SDK's generic base). Our app-specific `PbUsers`
 * extends `PbRecord`, which is structurally compatible with `RecordModel`
 * minus the SDK-only fields (`expand`, etc.). The cast happens at the trust
 * boundary (the authStore); downstream consumers see `PbRecord` (per the
 * `PbAuthState.user` contract) and can narrow with `collectionName === "users"`.
 */
function toPbUser(record: unknown): PbRecord | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.collectionId !== "string") return null;
  if (typeof r.collectionName !== "string") return null;
  // Structural cast — PbUsers extends PbRecord and the auth store only ever
  // holds records from the auth collection (users), so this is safe.
  return r as unknown as PbUsers;
}

const PbAuthContext = createContext<PbAuthState | null>(null);

/**
 * Provider. Mount once near the root of the app (alongside the Convex
 * provider). Renders its children unconditionally; the actual auth state
 * is exposed via `useAuth()`.
 *
 * Lifecycle:
 *   - First render: `isLoading: true, user: null`. The provider hasn't
 *     asked PB yet, so we don't know.
 *   - On mount: call `pb.collection('users').authRefresh()`. If the SDK's
 *     localStorage has a valid token, this succeeds and we get a fresh
 *     `PbUsers`. If not, it 401s and the SDK clears the store.
 *   - Subsequent renders: track `pb.authStore.onChange()` so any sign-in /
 *     sign-out / refresh from anywhere in the app re-renders consumers.
 */
export function PbAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PbRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Stable refs for the current pb client and the unsubscribe fn so we
  // don't double-subscribe on hot-reload or StrictMode double-mount.
  const clientRef = useRef(getPbClient());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pb = clientRef.current;
    let cancelled = false;

    // Initial rehydrate.
    (async () => {
      try {
        if (pb.authStore.isValid) {
          // Token in localStorage; verify it's still good. If expired, the
          // SDK throws a 401 and we fall through to `setUser(null)`.
          await pb.collection("users").authRefresh();
        }
      } catch {
        // Token was invalid; SDK already cleared the store.
      } finally {
        if (!cancelled) {
          setUser(toPbUser(pb.authStore.record));
          setIsLoading(false);
        }
      }
    })();

    // Subscribe to subsequent changes (sign-in, sign-out, refresh).
    const unsub = pb.authStore.onChange((_token, record) => {
      if (cancelled) return;
      setUser(toPbUser(record));
    }, /* fireImmediately */ false);
    unsubscribeRef.current = unsub;

    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const pb = clientRef.current;
    await pb.collection("users").authWithPassword(email, password);
    // onChange will fire and update `user`.
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, passwordConfirm: string) => {
      const pb = clientRef.current;
      await pb.collection("users").create({ email, password, passwordConfirm });
      // PB doesn't auto sign-in after create; do it now.
      await pb.collection("users").authWithPassword(email, password);
    },
    [],
  );

  const signOut = useCallback(async () => {
    const pb = clientRef.current;
    pb.authStore.clear();
    // onChange will fire and update `user`.
  }, []);

  const value: PbAuthState = {
    user,
    isLoading,
    signIn,
    signOut,
    signUp,
  };

  return <PbAuthContext.Provider value={value}>{children}</PbAuthContext.Provider>;
}

/**
 * Hook. Returns the current auth state from the nearest `PbAuthProvider`.
 * Throws if used outside a provider — that's a programmer error, not a
 * runtime condition to swallow.
 */
export function useAuth(): PbAuthState {
  const ctx = useContext(PbAuthContext);
  if (ctx === null) {
    throw new Error(
      "pb-compat: useAuth() called outside <PbAuthProvider>. " +
        "Wrap the app (or the relevant subtree) in PbAuthProvider.",
    );
  }
  return ctx;
}
