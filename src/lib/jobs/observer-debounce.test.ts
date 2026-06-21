import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  observerTimers,
  scheduleObserverDebounce,
  clearAllObserverTimers,
  type RunObserverFn,
} from "./observer-debounce";

beforeEach(() => {
  vi.useFakeTimers();
  clearAllObserverTimers();
});

afterEach(() => {
  vi.useRealTimers();
  clearAllObserverTimers();
});

describe("Observer Debounce", () => {
  it("should only fire observer once after rapid messages", async () => {
    const runObserver = vi.fn().mockResolvedValue({
      dailySummaryStatus: "created",
      memoriesExtracted: 0,
    }) as unknown as RunObserverFn;
    const pb = {} as any;

    // Simulate 3 rapid messages (10 seconds apart)
    scheduleObserverDebounce(pb, "user-1", "UTC", "session-1", runObserver);
    expect(observerTimers.size).toBe(1);

    vi.advanceTimersByTime(10_000); // +10s
    scheduleObserverDebounce(pb, "user-1", "UTC", "session-1", runObserver);
    expect(observerTimers.size).toBe(1); // still 1 timer

    vi.advanceTimersByTime(10_000); // +20s
    scheduleObserverDebounce(pb, "user-1", "UTC", "session-1", runObserver);
    expect(observerTimers.size).toBe(1); // still 1 timer

    // Verify observer has NOT been called yet
    expect(runObserver).not.toHaveBeenCalled();

    // Advance to just before 3 minutes — still not fired
    vi.advanceTimersByTime(160_000); // total 190s
    expect(runObserver).not.toHaveBeenCalled();

    // Advance past 3 minutes from the LAST message (30s remaining)
    vi.advanceTimersByTime(30_000);
    await vi.runAllTimersAsync();

    // Observer should have been called exactly ONCE
    expect(runObserver).toHaveBeenCalledTimes(1);
    expect(runObserver).toHaveBeenCalledWith(pb, {
      userId: "user-1",
      timezone: "UTC",
      sessionId: "session-1",
    });
  });

  it("should use different timers for different users", async () => {
    const runObserver = vi.fn().mockResolvedValue({
      dailySummaryStatus: "created",
      memoriesExtracted: 0,
    }) as unknown as RunObserverFn;
    const pb = {} as any;

    scheduleObserverDebounce(pb, "user-1", "UTC", "s1", runObserver);
    scheduleObserverDebounce(pb, "user-2", "UTC", "s2", runObserver);

    expect(observerTimers.size).toBe(2);

    vi.advanceTimersByTime(200_000);
    await vi.runAllTimersAsync();

    expect(runObserver).toHaveBeenCalledTimes(2);
  });

  it("should use different timers for different sessions of same user", async () => {
    const runObserver = vi.fn().mockResolvedValue({
      dailySummaryStatus: "created",
      memoriesExtracted: 0,
    }) as unknown as RunObserverFn;
    const pb = {} as any;

    scheduleObserverDebounce(pb, "user-1", "UTC", "session-a", runObserver);
    scheduleObserverDebounce(pb, "user-1", "UTC", "session-b", runObserver);

    expect(observerTimers.size).toBe(2);

    vi.advanceTimersByTime(200_000);
    await vi.runAllTimersAsync();

    expect(runObserver).toHaveBeenCalledTimes(2);
  });

  it("should clear all timers with clearAllObserverTimers", () => {
    const runObserver = vi.fn() as unknown as RunObserverFn;
    const pb = {} as any;

    scheduleObserverDebounce(pb, "user-1", "UTC", "s1", runObserver);
    scheduleObserverDebounce(pb, "user-2", "UTC", "s2", runObserver);
    expect(observerTimers.size).toBe(2);

    clearAllObserverTimers();
    expect(observerTimers.size).toBe(0);
  });
});
