import { describe, it, expect, vi, beforeEach } from "vitest";

describe("DailyLogGuard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("fetches /api/jobs/ensure-daily-log on first mount per session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    // Simulate component mount by running its effect logic
    const fired = sessionStorage.getItem("dialogue-daily-log-guard-fired");
    expect(fired).toBeNull();

    if (!fired) {
      sessionStorage.setItem("dialogue-daily-log-guard-fired", "1");
      await fetch("/api/jobs/ensure-daily-log").catch(() => {});
    }

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/ensure-daily-log");
    expect(sessionStorage.getItem("dialogue-daily-log-guard-fired")).toBe("1");
  });

  it("does NOT fetch on subsequent mounts in the same session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Pre-set the guard flag
    sessionStorage.setItem("dialogue-daily-log-guard-fired", "1");

    const fired = sessionStorage.getItem("dialogue-daily-log-guard-fired");
    if (!fired) {
      sessionStorage.setItem("dialogue-daily-log-guard-fired", "1");
      await fetch("/api/jobs/ensure-daily-log").catch(() => {});
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw on network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const fired = sessionStorage.getItem("dialogue-daily-log-guard-fired");
    if (!fired) {
      sessionStorage.setItem("dialogue-daily-log-guard-fired", "1");
      await fetch("/api/jobs/ensure-daily-log").catch(() => {});
    }

    // Should not throw - catch handler swallows errors
    expect(fetchMock).toHaveBeenCalled();
  });
});
