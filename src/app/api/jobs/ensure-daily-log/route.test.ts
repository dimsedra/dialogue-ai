import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateDailySummary = vi.fn();
const mockGetPbAdmin = vi.fn();

vi.mock("@/lib/pb-server-admin", () => ({
  getPbAdmin: mockGetPbAdmin,
}));

vi.mock("@/lib/jobs/generateDailySummary", () => ({
  generateDailySummary: mockGenerateDailySummary,
}));

const { GET } = await import("./route");

describe("GET /api/jobs/ensure-daily-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok false when no users exist", async () => {
    mockGetPbAdmin.mockResolvedValue({
      collection: () => ({
        getFullList: async () => [],
      }),
    });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({ ok: false, reason: "no_users" });
    expect(mockGenerateDailySummary).not.toHaveBeenCalled();
  });

  it("calls generateDailySummary for the first user and returns status", async () => {
    mockGetPbAdmin.mockResolvedValue({
      collection: () => ({
        getFullList: async () => [{ id: "user-123" }],
      }),
    });
    mockGenerateDailySummary.mockResolvedValue({ status: "created" });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({ ok: true, status: "created" });
    expect(mockGenerateDailySummary).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ userId: "user-123" }),
    );
  });

  it("handles errors gracefully", async () => {
    mockGetPbAdmin.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET();
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("DB connection failed");
  });
});
