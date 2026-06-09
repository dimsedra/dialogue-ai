// Convex has been fully removed. PocketBase is the sole backend.

export function isPbBackend(): boolean {
  return true;
}

export const PB_COMPAT_PHASE = 5 as const;
export const PB_COMPAT_STATUS = "done" as const;
