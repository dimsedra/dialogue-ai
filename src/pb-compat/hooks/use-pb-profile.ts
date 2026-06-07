// usePbProfile — Phase 2 Stage B.7.3.
//
// What this file does:
//   - Bridges the PB `userProfile.get` descriptor (B.7.2) into the
//     Convex-shaped `Doc<"userProfile">` that the existing consumer
//     code in Chat.tsx, settings/page.tsx, and usePushSync.ts already
//     reads (`profile._id`, `profile.userId`, `profile.preferences.*`).
//   - Reads the current user id from `useAuth()` (B.7.1), passes it
//     to the descriptor's `buildFilter`, and maps the PB record to
//     the Convex shape at the trust boundary.
//
// Why a wrapper, not a direct call?
//   - Three separate consumers (Chat, settings, usePushSync) would
//     each need the same auth-read + useQuery + shape-map logic.
//     Centralizing into one hook keeps the consumer changes to a
//     single `useQuery(api.ai.getProfile, {})` → two `useQuery` calls
//     + a ternary swap.
//   - The Convex-shape mapping is a leaky abstraction (a future B.x
//     will move it to a server-side proxy that decrypts API keys);
//     for B.7.3 the leak is contained here, not duplicated across
//     consumers.
//
// What this hook does NOT do:
//   - Decrypt API keys in `preferences.customConfigs[*].apiKey`.
//     The Convex `getProfile` decrypts server-side using ENCRYPTION_KEY.
//     The PB descriptor runs in the browser; ENCRYPTION_KEY is not
//     available. A future B.x adds a server-side proxy.
//   - Map every Convex field. Only the fields the three consumers
//     read are mapped (`_id`, `userId`, `name`, `bio`, `preferences`,
//     `_creationTime` for completeness). Other fields
//     (`weeklyNotesSummaries`, `monthlyNotesSummaries`,
//     `behavioralProfile`) are passed through as `undefined`. If a
//     future consumer reads one of these, add it here.

import { useAuth } from "../auth";
import { useQuery } from "../use-query";
import { userProfileGetQuery } from "../descriptors/userProfile";
import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * Read the current user's profile via PB and return it in the
 * Convex `Doc<"userProfile">` shape that the existing consumer code
 * expects.
 *
 * Returns `undefined` when:
 *   - The first fetch is still in flight (matches Convex useQuery).
 *   - No user is signed in (`useAuth().user` is null).
 *   - No `user_profile` record exists for the authed user.
 *
 * Field mapping (PB → Convex):
 *   - id            → _id            (string → Convex Id<"userProfile">)
 *   - user          → userId         (PbId<"users"> → Id<"users">)
 *   - created (ISO) → _creationTime  (string → number, ms since epoch)
 *   - name, bio     → name, bio      (passthrough)
 *   - preferences   → preferences    (passthrough, possibly encrypted)
 *
 * The cast `as unknown as Doc<"userProfile">` is the trust boundary.
 * The Convex runtime guarantees the field types; the PB side mirrors
 * them structurally. If a future Convex schema change introduces a
 * new required field, the cast will silently omit it (TypeScript
 * can't catch this) — keep the test suite in sync with schema changes.
 */
export function usePbProfile(): Doc<"userProfile"> | undefined {
  const { user } = useAuth();
  // When no user is signed in, pass undefined. The descriptor's
  // buildFilter returns the no-match filter ("1 = 2"), so the query
  // resolves to undefined without surfacing an error. The HTTP
  // round-trip still happens — acceptable in dev (DCE'd in prod
  // with the flag off at build time).
  const pbProfile = useQuery(
    userProfileGetQuery,
    user ? { user: user.id } : undefined,
  );
  if (!pbProfile) return undefined;
  return {
    _id: pbProfile.id as unknown as Doc<"userProfile">["_id"],
    _creationTime: pbProfile.created
      ? new Date(pbProfile.created).getTime()
      : 0,
    userId: pbProfile.user as unknown as Doc<"userProfile">["userId"],
    name: pbProfile.name,
    bio: pbProfile.bio,
    preferences: pbProfile.preferences,
  } as unknown as Doc<"userProfile">;
}
