import PocketBase from "pocketbase";
import { AsyncLocalStorage } from "async_hooks";

const globalAny = global as any;
if (!globalAny.pbRequestContext) {
  globalAny.pbRequestContext = new AsyncLocalStorage<PocketBase>();
}
export const pbRequestContext: AsyncLocalStorage<PocketBase> = globalAny.pbRequestContext;

/**
 * Get the PocketBase client for the current request.
 * Returns the per-request authenticated client if available.
 * Throws if not running within a pbRequestContext.run block.
 */
export function getPbClient(): PocketBase {
  const client = pbRequestContext.getStore();
  if (!client) {
    throw new Error("getPbClient() must be called within pbRequestContext.run()");
  }
  return client;
}

/**
 * Resolves the active user ID from the given PocketBase client.
 * If authenticated as a user (checking collectionName === 'users'), returns the user's ID.
 * Otherwise (admin or unauthenticated), returns the ID of the first user in the database.
 */
export async function getActiveUserId(pb: PocketBase): Promise<string | undefined> {
  const record = pb.authStore.record;
  if (record && (record.collectionName === 'users' || (record as any).collectionName === 'users')) {
    return record.id;
  }
  
  try {
    const users = await pb.collection('users').getFullList({ limit: 1 });
    if (users.length > 0) {
      return users[0].id;
    }
  } catch (err) {
    console.error('[getActiveUserId] Failed to fetch user fallback list:', err);
  }
  return undefined;
}

