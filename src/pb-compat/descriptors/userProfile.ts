// userProfile.get — Phase 2 Stage B.7.2.
//
// What this file does:
//   - Defines `userProfileGetQuery`, a `PbQuery` that fetches the current
//     user's profile from the `user_profile` PB collection.
//   - The query uses a custom `buildFilter` callback (B.7.2 addition to
//     `PbQueryDescriptor`) because the filter needs the current user id,
//     which is runtime state on `pb.authStore.record` and not in the
//     `args` object the consumer passes.
//
// Why a "first" query and not a "get" with matchField?
//   - The PB access rule for `user_profile` is `user = @request.auth.id`.
//     The "first with filter" pattern matches Convex's
//     `.withIndex("by_user", q => q.eq("userId", userId)).first()` shape
//     and is verified by `idx_user_profile_user` in the migration.
//   - A "get" with matchField="user" would also work but the index would
//     not be used; "first" with a filter is the cheaper path.
//
// Consumer usage (B.7.3):
//   import { api, useAuth, useQuery } from "@/pb-compat";
//   const { user } = useAuth();
//   const profile = useQuery(
//     api.userProfile.get,
//     user ? { user: user.id } : undefined,
//   );
//
// What this module does NOT do (deferred to a future B.x):
//   - Encrypted-key decryption. The Convex `getProfile` decrypts API
//     keys server-side. The PB descriptor runs in the browser; the
//     ENCRYPTION_KEY is not available here. The first read returns the
//     encrypted blob (or `undefined` if no profile exists yet). A future
//     B.x will add a server-side proxy that decrypts before returning.
//   - The descriptor's `impl` is unused by `useQuery` (the hook reads
//     the descriptor metadata directly). It is kept for symmetry with
//     the other descriptors and for direct-call use from non-React code.

import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbUserProfile } from "../_generated/dataModel";

/**
 * Args for `userProfileGetQuery`. The `user` field is the PB user id
 * (the value of `pb.authStore.record.id`). When `undefined`, the
 * buildFilter returns a no-match filter so the query returns `undefined`
 * without a real fetch (the consumer gates on `useAuth().user`).
 */
export type UserProfileGetArgs =
  | { user: string }
  | undefined;

/**
 * Build the PB filter for the current-user profile lookup. Exported for
 * unit testing — `useQuery` reads it via the descriptor's `buildFilter`.
 *
 * Returns a tautologically-false filter (`"1 = 2"`) when args is missing
 * or the user id is empty, so `getList(1, 1, { filter })` returns
 * `{ items: [] }` and the hook returns `undefined` without surfacing an
 * error.
 *
 * Escapes double quotes in the user id (PB filter string syntax).
 */
export function buildUserFilter(
  args: Record<string, unknown> | undefined,
): string {
  if (!args || typeof args !== "object") {
    return "1 = 2";
  }
  const user = (args as { user?: unknown }).user;
  if (typeof user !== "string" || user.length === 0) {
    return "1 = 2";
  }
  const escaped = user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escaped}"`;
}

/**
 * Direct-call implementation. Invoked by callers that bypass `useQuery`
 * (e.g. a future server-side proxy or a useAction handler). Mirrors the
 * hook's logic so the result is identical regardless of entry point.
 *
 * Returns `null` when the user is not signed in or no profile exists.
 */
async function getUserProfileImpl(
  args: UserProfileGetArgs,
): Promise<PbUserProfile | null> {
  const pb = getPbClient();
  const userId = args?.user ?? pb.authStore.record?.id;
  if (!userId) {
    return null;
  }
  const list = await pb.collection("user_profile").getList(1, 1, {
    filter: `user = "${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  });
  return (list.items[0] as PbUserProfile | undefined) ?? null;
}

/**
 * The reactive query. `useQuery` reads the descriptor's metadata
 * (collection, kind, buildFilter) and wires the subscription; the
 * `impl` above is the direct-call path.
 */
export const userProfileGetQuery = defineQuery<
  UserProfileGetArgs,
  PbUserProfile | null
>(
  {
    collection: "user_profile",
    kind: "first",
    buildFilter: buildUserFilter,
  },
  getUserProfileImpl,
);
