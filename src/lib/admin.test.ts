import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  messageCount: vi.fn(),
  messageAggregate: vi.fn(),
  ragDocumentCount: vi.fn(),
  getDetailedSystemHealth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: mocks.userCount,
    },
    message: {
      count: mocks.messageCount,
      aggregate: mocks.messageAggregate,
    },
    ragDocument: {
      count: mocks.ragDocumentCount,
    },
  },
}));

vi.mock("@/lib/system-health", () => ({
  getSystemHealth: mocks.getDetailedSystemHealth,
}));

import { getOverviewStats, getStartDate, getSystemHealth } from "./admin";

describe("admin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00.000Z"));
    mocks.userCount.mockReset();
    mocks.messageCount.mockReset();
    mocks.messageAggregate.mockReset();
    mocks.ragDocumentCount.mockReset();
    mocks.getDetailedSystemHealth.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates start date from supported ranges", () => {
    expect(getStartDate("7d")).toEqual(new Date("2026-02-09T12:00:00.000Z"));
    expect(getStartDate("30d")).toEqual(new Date("2026-01-17T12:00:00.000Z"));
    expect(getStartDate("90d")).toEqual(new Date("2025-11-18T12:00:00.000Z"));
    expect(getStartDate("all")).toBeNull();
    expect(getStartDate("unknown")).toEqual(
      new Date("2026-02-09T12:00:00.000Z"),
    );
  });

  it("returns overview stats with rounded averages and period filters", async () => {
    const startDate = new Date("2026-02-01T00:00:00.000Z");
    mocks.userCount.mockResolvedValueOnce(100).mockResolvedValueOnce(20);
    mocks.messageCount.mockResolvedValueOnce(1000).mockResolvedValueOnce(250);
    mocks.messageAggregate.mockResolvedValue({
      _sum: { costUsd: 12.3456789 },
    });
    mocks.ragDocumentCount.mockResolvedValue(7);

    const result = await getOverviewStats(startDate);

    expect(mocks.userCount).toHaveBeenNthCalledWith(1);
    expect(mocks.userCount).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { gte: startDate } },
    });
    expect(mocks.messageCount).toHaveBeenNthCalledWith(1);
    expect(mocks.messageCount).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { gte: startDate } },
    });
    expect(mocks.messageAggregate).toHaveBeenCalledWith({
      _sum: { costUsd: true },
      where: {
        createdAt: { gte: startDate },
        costUsd: { not: null },
      },
    });

    expect(result).toEqual({
      totalUsers: 100,
      newUsersInPeriod: 20,
      totalMessages: 1000,
      messagesInPeriod: 250,
      totalCostUsd: 12.3456789,
      costInPeriod: 12.3456789,
      avgMessagesPerUser: 10,
      costPerUser: 0.617284,
      ragDocuments: 7,
    });
  });

  it("returns safe zeroed metrics when totals are empty", async () => {
    mocks.userCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mocks.messageCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mocks.messageAggregate.mockResolvedValue({
      _sum: { costUsd: null },
    });
    mocks.ragDocumentCount.mockResolvedValue(0);

    const result = await getOverviewStats(null);

    expect(mocks.userCount).toHaveBeenNthCalledWith(2, { where: {} });
    expect(mocks.messageCount).toHaveBeenNthCalledWith(2, { where: {} });
    expect(mocks.messageAggregate).toHaveBeenCalledWith({
      _sum: { costUsd: true },
      where: { costUsd: { not: null } },
    });
    expect(result.avgMessagesPerUser).toBe(0);
    expect(result.costPerUser).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it("delegates system health to the shared live checker", async () => {
    const health = {
      database: { status: "connected" as const },
      openrouter: { status: "connected" as const },
      clerk: { status: "connected" as const },
      vercelBlob: { status: "connected" as const },
    };
    mocks.getDetailedSystemHealth.mockResolvedValue(health);

    const result = await getSystemHealth();

    expect(result).toBe(health);
    expect(mocks.getDetailedSystemHealth).toHaveBeenCalledTimes(1);
  });
});
