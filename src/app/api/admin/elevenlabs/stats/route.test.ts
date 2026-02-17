import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getElevenLabsSubscription: vi.fn(),
  getSystemLoad: vi.fn(),
  voiceUsageAggregate: vi.fn(),
  queryRaw: vi.fn(),
  voiceUsageGroupBy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/voice", () => ({
  getElevenLabsSubscription: mocks.getElevenLabsSubscription,
  getSystemLoad: mocks.getSystemLoad,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: {
      aggregate: mocks.voiceUsageAggregate,
      groupBy: mocks.voiceUsageGroupBy,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "./route";

describe("GET /api/admin/elevenlabs/stats", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.getElevenLabsSubscription.mockReset();
    mocks.getSystemLoad.mockReset();
    mocks.voiceUsageAggregate.mockReset();
    mocks.queryRaw.mockReset();
    mocks.voiceUsageGroupBy.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.getElevenLabsSubscription.mockResolvedValue({
      character_count: 1200,
      character_limit: 10000,
      next_character_count_reset_unix: 1700000000,
    });
    mocks.getSystemLoad.mockResolvedValue(0.42);
    mocks.voiceUsageAggregate
      .mockResolvedValueOnce({
        _sum: { characterCount: 100, costUsd: 0.3 },
        _count: { id: 2 },
      })
      .mockResolvedValueOnce({
        _sum: { characterCount: 400, costUsd: 1.2 },
        _count: { id: 8 },
      })
      .mockResolvedValueOnce({
        _sum: { characterCount: 900, costUsd: 2.7 },
        _count: { id: 18 },
      });
    mocks.queryRaw.mockResolvedValue([
      {
        date: new Date("2026-02-10T00:00:00.000Z"),
        count: BigInt(3),
        characters: BigInt(250),
      },
    ]);
    mocks.voiceUsageGroupBy.mockResolvedValue([
      {
        channel: "WEB",
        _count: { id: 5 },
        _sum: { characterCount: 320 },
      },
    ]);
  });

  it("returns admin error response when unauthorized", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns mapped voice stats payload", async () => {
    const response = await GET();

    expect(mocks.getElevenLabsSubscription).toHaveBeenCalledWith(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subscription: {
        characterCount: 1200,
        characterLimit: 10000,
        nextResetUnix: 1700000000,
      },
      systemLoad: 0.42,
      stats: {
        today: {
          voiceMessages: 2,
          characters: 100,
          costUsd: 0.3,
        },
        week: {
          voiceMessages: 8,
          characters: 400,
          costUsd: 1.2,
        },
        month: {
          voiceMessages: 18,
          characters: 900,
          costUsd: 2.7,
        },
      },
      history: [
        {
          date: "2026-02-10",
          voiceMessages: 3,
          charactersUsed: 250,
        },
      ],
      channelBreakdown: [
        {
          channel: "WEB",
          count: 5,
          characters: 320,
        },
      ],
    });
  });

  it("returns 500 on downstream error", async () => {
    mocks.getElevenLabsSubscription.mockRejectedValue(new Error("api down"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch stats",
    });
  });
});
