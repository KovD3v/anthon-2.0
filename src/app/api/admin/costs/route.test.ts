import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  messageAggregate: vi.fn(),
  messageGroupBy: vi.fn(),
  voiceUsageAggregate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      aggregate: mocks.messageAggregate,
      groupBy: mocks.messageGroupBy,
    },
    voiceUsage: {
      aggregate: mocks.voiceUsageAggregate,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/costs", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.messageAggregate.mockReset();
    mocks.messageGroupBy.mockReset();
    mocks.voiceUsageAggregate.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.messageAggregate.mockResolvedValue({
      _sum: {
        costUsd: 12.5,
        inputTokens: 2000,
        outputTokens: 3000,
      },
    });
    mocks.messageGroupBy
      .mockResolvedValueOnce([
        { model: "gpt-4", _sum: { costUsd: 8 }, _count: 4 },
        { model: "gpt-3.5", _sum: { costUsd: 4.5 }, _count: 6 },
      ])
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-02-15T01:00:00.000Z"), _sum: { costUsd: 1 } },
        { createdAt: new Date("2026-02-15T05:00:00.000Z"), _sum: { costUsd: 2 } },
        { createdAt: new Date("2026-02-16T04:00:00.000Z"), _sum: { costUsd: 3 } },
      ]);
    mocks.voiceUsageAggregate.mockResolvedValue({
      _sum: {
        costUsd: 1.25,
        characterCount: 1500,
      },
    });
  });

  it("returns admin error response when unauthorized", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/costs") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns aggregated cost analysis payload", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/costs?range=7d") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summary: {
        totalAiCost: 12.5,
        totalVoiceCost: 1.25,
        totalTokens: 5000,
        totalVoiceCharacters: 1500,
      },
      aiBreakdown: [
        { model: "gpt-4", cost: 8, count: 4 },
        { model: "gpt-3.5", cost: 4.5, count: 6 },
      ],
      infrastructure: {
        clerk: { current: 0, nextTier: 25, limit: "10,000 MAUs" },
        neon: { current: 0, nextTier: 19, limit: "512MB RAM, 10GB Storage" },
        vercel: { current: 0, nextTier: 20, limit: "1TB Bandwidth" },
        whatsapp: { current: 0, templateCostAvg: 0.05 },
      },
      history: {
        ai: [
          { date: "2026-02-15", cost: 3 },
          { date: "2026-02-16", cost: 3 },
        ],
      },
    });
  });

  it("returns 500 when query fails", async () => {
    mocks.messageAggregate.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/admin/costs") as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch cost analysis",
    });
  });
});
