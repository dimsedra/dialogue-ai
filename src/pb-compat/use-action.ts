// useAction — Phase 2 minimal.
//
// What this does:
//   - Returns a callable that POSTs args to a Next.js API route
//     (`/api/pb-action/<name>`) and returns the parsed result.
//   - The route dispatcher resolves `name` to a registered handler and
//     runs it server-side (with user context from the Bearer token).
//   - The callable reads the PB auth token at CALL TIME (not hook time)
//     so sign-in / sign-out during a session is picked up.
//
// What this deliberately does NOT do:
//   - Optimistic UI. Returns a Promise, like Convex's runAsync.
//   - Caching / dedup. Each useAction call opens a new fetch.
//   - Streaming responses. The chat action uses its own streaming route
//     (`/api/chat`) — this hook is for non-streaming request/response.
//   - Auto-retry. Errors propagate to the caller.

import { getPbClient } from "./client";
import { isPbBackend } from "./index";

// =============================================================================
// Descriptor + request/response shapes.
// =============================================================================

export interface PbActionDescriptor {
  /** Action name, e.g. "parseDate". Maps to `/api/pb-action/<name>`. */
  name: string;
}

export interface PbActionRequest<TArgs> {
  args: TArgs;
}

export interface PbActionResponse<TResult> {
  ok: boolean;
  result?: TResult;
  error?: string;
}

export function defineAction(name: string): PbActionDescriptor {
  return { name };
}

// =============================================================================
// Pure helper — exported for testing. Takes a fetch implementation (real
// or mock), the PB token (or null), and posts to the API.
// =============================================================================

export async function executePbAction<TResult>(
  descriptor: PbActionDescriptor,
  args: unknown,
  options: { token: string | null; fetchImpl?: typeof fetch } = { token: null },
): Promise<TResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`/api/pb-action/${descriptor.name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ args } satisfies PbActionRequest<unknown>),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `pb-compat: action ${descriptor.name} returned ${res.status}: ${text}`,
    );
  }
  const body = (await res.json()) as PbActionResponse<TResult>;
  if (!body.ok) {
    throw new Error(
      `pb-compat: action ${descriptor.name} failed: ${body.error ?? "unknown error"}`,
    );
  }
  return body.result as TResult;
}

// =============================================================================
// The hook. Returns a callable that fetches with the live PB token.
// =============================================================================

export function useAction<TArgs, TResult>(
  descriptor: PbActionDescriptor,
): (args: TArgs) => Promise<TResult> {
  if (!isPbBackend()) {
    throw new Error(
      "pb-compat: useAction called when isPbBackend() is false. " +
        "Gate the consumer on isPbBackend() (or default to Convex).",
    );
  }
  return async (args: TArgs) => {
    // Read the token at call time, not hook time, so sign-in / sign-out
    // during the session is picked up.
    const token = getPbClient().authStore.token || null;
    return executePbAction<TResult>(descriptor, args, { token });
  };
}
