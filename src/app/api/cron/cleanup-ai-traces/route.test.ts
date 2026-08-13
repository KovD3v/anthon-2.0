import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteExpiredAiTurnTraces: vi.fn(),
  cleanupExpiredAiUsageReservations: vi.fn(),
}));

vi.mock("@/lib/ai/trace", () => ({
  deleteExpiredAiTurnTraces: mocks.deleteExpiredAiTurnTraces,
}));

vi.mock("@/lib/rate-limit/reservation-retention", () => ({
  cleanupExpiredAiUsageReservations: mocks.cleanupExpiredAiUsageReservations,
}));

import { GET, POST } from "./route";

const originalEnv = { ...process.env };

function createRequest() {
  return new Request("http://localhost/api/cron/cleanup-ai-traces", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("/api/cron/cleanup-ai-traces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.deleteExpiredAiTurnTraces.mockResolvedValue(7);
    mocks.cleanupExpiredAiUsageReservations.mockResolvedValue({
      expired: 3,
      recoveryCleared: 2,
      deleted: 4,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects an unauthorized request without running retention", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-ai-traces", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.deleteExpiredAiTurnTraces).not.toHaveBeenCalled();
    expect(mocks.cleanupExpiredAiUsageReservations).not.toHaveBeenCalled();
  });

  it("runs trace and usage retention and reports both count groups", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.deleteExpiredAiTurnTraces).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupExpiredAiUsageReservations).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      success: true,
      deleted: 7,
      usageReservations: { expired: 3, recoveryCleared: 2, deleted: 4 },
    });
  });

  it("keeps the GET entry point on the same authenticated cleanup", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deleted: 7,
      usageReservations: { expired: 3, recoveryCleared: 2, deleted: 4 },
    });
  });

  it("returns a bounded server error when retention fails", async () => {
    mocks.cleanupExpiredAiUsageReservations.mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Trace cleanup failed",
    });
  });
});
