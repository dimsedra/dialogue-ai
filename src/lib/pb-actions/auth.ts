// PB token verification — Phase 2 Stage B.4.
//
// What this does:
//   - Takes a PB auth token (the value of the `Authorization: Bearer <token>`
//     header sent by the client).
//   - Uses a server-side PocketBase singleton to call `authRefresh()`,
//     which validates the token and returns the user record.
//   - Returns the user (id + email) on success, null on failure.
//
// What this deliberately does NOT do:
//   - Trust the token without verification. `pb.authStore.save()` alone
//     is NOT enough — anyone can craft a token. We must call authRefresh
//     so PB validates it.
//   - Cache the user record. The token is the source of truth. If the
//     user is banned / deleted between requests, authRefresh will fail.

import PocketBase from "pocketbase";

export interface PbAuthUser {
  id: string;
  email: string;
  collectionName?: string;
}

let _serverPb: PocketBase | null = null;

function getServerPb(): PocketBase {
  if (!_serverPb) {
    _serverPb = new PocketBase(
      process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090",
    );
  }
  return _serverPb;
}

export async function verifyPbToken(token: string): Promise<PbAuthUser | null> {
  const pb = getServerPb();
  pb.authStore.save(token, null);
  try {
    await pb.collection("users").authRefresh();
    const user = pb.authStore.record;
    if (!user) return null;
    return { 
      id: user.id, 
      email: user.email,
      collectionName: user.collectionName || 'users'
    };
  } catch {
    return null;
  } finally {
    // Don't leak the verified token into the singleton's authStore
    // (next request might read it from there).
    pb.authStore.clear();
  }
}
