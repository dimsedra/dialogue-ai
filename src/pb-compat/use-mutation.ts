// useMutation — Phase 2 minimal.
//
// What this does:
//   - Returns a callable that performs a write against a PB collection.
//   - Three flavours: create, update, delete. Discriminated by `kind`.
//   - The callable accepts the args, awaits the PB SDK, and returns the
//     created/updated record (or void for delete).
//
// What this deliberately does NOT do:
//   - Reactive subscription. Writes are fire-and-forget. The consumer
//     re-renders by either re-invoking useQuery (PB's realtime channel
//     will push the update) or by trusting the returned record.
//   - Optimistic updates. Deferred to post-freeze per ADR-011.
//   - Caching / dedup. Each useMutation call opens a new write.
//   - Batch writes. PB supports transactions, but we don't need them yet.
//   - useCallback wrapping. The returned function is fresh per render,
//     which is fine for event-handler usage (the typical pattern).

import PocketBase from "pocketbase";
import { getPbClient } from "./client";
import { isPbBackend } from "./index";

// =============================================================================
// Descriptor types — discriminated union on `kind`.
// =============================================================================

export type PbMutationKind = "create" | "update" | "delete";

export interface PbCreateDescriptor {
  collection: string;
  kind: "create";
}

export interface PbUpdateDescriptor {
  collection: string;
  kind: "update";
}

export interface PbDeleteDescriptor {
  collection: string;
  kind: "delete";
}

export type PbMutationDescriptor =
  | PbCreateDescriptor
  | PbUpdateDescriptor
  | PbDeleteDescriptor;

// =============================================================================
// Pure helper — exported for testing. Takes a PocketBase-shaped client
// (real SDK or test mock). The args shape is determined by `descriptor.kind`
// and is enforced by the useMutation overloads at the public surface.
// =============================================================================

export async function executePbMutation<TRecord = unknown>(
  pb: PocketBase,
  descriptor: PbMutationDescriptor,
  args: unknown,
): Promise<TRecord | void> {
  const col = pb.collection(descriptor.collection);
  if (descriptor.kind === "create") {
    return (await col.create(args as { [key: string]: unknown })) as TRecord;
  }
  if (descriptor.kind === "update") {
    const { id, record } = args as { id: string; record: Partial<TRecord> };
    return (await col.update(id, record)) as TRecord;
  }
  // delete
  const { id } = args as { id: string };
  await col.delete(id);
}

// =============================================================================
// The hook. Three overloads narrow the args/result types per kind.
// =============================================================================

export function useMutation<TRecord>(
  descriptor: PbCreateDescriptor,
): (args: TRecord) => Promise<TRecord>;

export function useMutation<TRecord>(
  descriptor: PbUpdateDescriptor,
): (args: { id: string; record: Partial<TRecord> }) => Promise<TRecord>;

export function useMutation(
  descriptor: PbDeleteDescriptor,
): (args: { id: string }) => Promise<void>;

export function useMutation<TRecord = unknown>(
  descriptor: PbMutationDescriptor,
): (args: unknown) => Promise<TRecord | void> {
  if (!isPbBackend()) {
    throw new Error(
      "pb-compat: useMutation called when isPbBackend() is false. " +
        "Gate the consumer on isPbBackend() (or default to Convex).",
    );
  }
  return async (args) =>
    executePbMutation<TRecord>(getPbClient(), descriptor, args);
}
