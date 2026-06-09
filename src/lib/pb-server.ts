import PocketBase from "pocketbase";
import { AsyncLocalStorage } from "async_hooks";

// Per-request authenticated client via AsyncLocalStorage.
// The chat route sets the auth token before agent execution; tools read it.
export const pbRequestContext = new AsyncLocalStorage<PocketBase>();

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
