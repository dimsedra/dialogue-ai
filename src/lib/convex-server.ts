import { ConvexHttpClient } from "convex/browser";
import { AsyncLocalStorage } from "async_hooks";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not defined in environment variables");
}

// Unauthenticated client for public queries
export const convexServerClient = new ConvexHttpClient(convexUrl);

// Per-request authenticated client via AsyncLocalStorage.
// The chat route sets the auth token before agent execution; tools read it.
export const requestContext = new AsyncLocalStorage<ConvexHttpClient>();

/**
 * Get the Convex client for the current request.
 * Returns the per-request authenticated client if available,
 * otherwise falls back to the unauthenticated server client.
 */
export function getConvexClient(): ConvexHttpClient {
  return requestContext.getStore() ?? convexServerClient;
}
