// PocketBase action registry — Phase 2 Stage B.4.
//
// What this does:
//   - Maps action names to server-side handlers.
//   - Each handler is `(args, ctx) => Promise<result>` where ctx includes
//     the authenticated user.
//   - Adding a new action = adding an entry to the `handlers` map + a
//     handler file. The dispatcher route resolves the name at runtime.
//
// What this deliberately does NOT do:
//   - Per-action validation. Handlers validate their own args.
//   - Auth/permission checks. The dispatcher verifies the Bearer token
//     before the handler is called. Per-action auth (e.g. admin-only) is
//     the handler's responsibility.
//   - Streaming. The chat action uses its own streaming route.

export interface PbActionContext {
  user: { id: string; email: string };
}

export type PbActionHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  ctx: PbActionContext,
) => Promise<TResult>;

// =============================================================================
// Handler registry.
//
// Each entry is a name -> handler. The dispatcher's POST /api/pb-action/<name>
// looks up the handler here and runs it with the request args + user ctx.
//
// The map type is intentionally permissive: handlers validate their own
// args at runtime, and the dispatcher doesn't care about the types. The
// `any` here is a controlled leak at the registry boundary, not in
// the public surface.
// =============================================================================

import { parseDate } from "./parseDate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, PbActionHandler<any, any>> = {
  parseDate,
  // More handlers added as B.7 migrates consumers. The 8 Convex actions
  // estimated by the migration plan mostly have Next.js API routes already
  // (chat, embeddings, graph/memory, cron/ocean, admin/memory-health) or
  // are server-side only (sendPushNotification, called from cron route).
  // parseDate is the only Convex action that needed a new route.
};

export function getActionHandler(name: string): PbActionHandler | undefined {
  return handlers[name];
}

export function listActionNames(): string[] {
  return Object.keys(handlers);
}
