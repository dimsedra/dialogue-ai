import type PocketBase from "pocketbase";
import type { RunObserverResult } from "./observer";

const DEBOUNCE_MS = 180_000; // 3 minutes

export const observerTimers: Map<string, NodeJS.Timeout> =
  (global as any).__observerTimers || new Map<string, NodeJS.Timeout>();

if (process.env.NODE_ENV !== "production") {
  (global as any).__observerTimers = observerTimers;
}

export type RunObserverFn = (
  pb: PocketBase,
  args: { userId: string; timezone: string; sessionId?: string }
) => Promise<RunObserverResult>;

export function scheduleObserverDebounce(
  pb: PocketBase,
  userId: string,
  timezone: string,
  sessionId?: string,
  runObserverFn?: RunObserverFn,
) {
  const timerKey = `${userId}-${sessionId || "global"}`;

  if (observerTimers.has(timerKey)) {
    console.log(`[Observer Debounce] Clearing existing timer for key: ${timerKey}`);
    clearTimeout(observerTimers.get(timerKey));
  }

  console.log(`[Observer Debounce] Setting timer (3 mins) for key: ${timerKey}`);
  const timer = setTimeout(() => {
    observerTimers.delete(timerKey);
    console.log(`[Observer Debounce] Timer fired. Running Observer for key: ${timerKey}`);

    const runFn = runObserverFn || ((() => import("./observer").then((m) => m.runObserver)) as unknown as RunObserverFn);
    runFn(pb, { userId, timezone, sessionId }).catch((err: unknown) => {
      console.error("[Observer Debounce] Background execution failed:", err);
    });
  }, DEBOUNCE_MS);

  observerTimers.set(timerKey, timer);
}

export function clearAllObserverTimers() {
  for (const [, timer] of observerTimers) {
    clearTimeout(timer);
  }
  observerTimers.clear();
}
