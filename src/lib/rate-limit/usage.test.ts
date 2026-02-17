import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    dailyUsage: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

import { getDailyUsage, incrementUsage } from "./usage";

describe("rate-limit/usage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T15:04:05.000Z"));
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
  });

  it("returns zeros when no usage exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const result = await getDailyUsage("user-1");

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: {
        userId_date: {
          userId: "user-1",
          date: new Date(Date.UTC(2026, 1, 16)),
        },
      },
    });
    expect(result).toEqual({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    });
  });

  it("maps an existing usage record", async () => {
    mocks.findUnique.mockResolvedValue({
      requestCount: 7,
      inputTokens: 1234,
      outputTokens: 567,
      totalCostUsd: 0.42,
    });

    const result = await getDailyUsage("user-2");

    expect(result).toEqual({
      requestCount: 7,
      inputTokens: 1234,
      outputTokens: 567,
      totalCostUsd: 0.42,
    });
  });

  it("increments usage with upsert and returns mapped fields", async () => {
    mocks.upsert.mockResolvedValue({
      requestCount: 4,
      inputTokens: 900,
      outputTokens: 450,
      totalCostUsd: 0.9,
    });

    const result = await incrementUsage("user-3", 200, 100, 0.2);

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: {
        userId_date: {
          userId: "user-3",
          date: new Date(Date.UTC(2026, 1, 16)),
        },
      },
      create: {
        userId: "user-3",
        date: new Date(Date.UTC(2026, 1, 16)),
        requestCount: 1,
        inputTokens: 200,
        outputTokens: 100,
        totalCostUsd: 0.2,
      },
      update: {
        requestCount: { increment: 1 },
        inputTokens: { increment: 200 },
        outputTokens: { increment: 100 },
        totalCostUsd: { increment: 0.2 },
      },
    });

    expect(result).toEqual({
      requestCount: 4,
      inputTokens: 900,
      outputTokens: 450,
      totalCostUsd: 0.9,
    });
  });
});
