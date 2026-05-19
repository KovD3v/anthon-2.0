import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  messageCount: vi.fn(),
  messageAggregate: vi.fn(),
  messageFindMany: vi.fn(),
  messageGroupBy: vi.fn(),
  ragDocumentCount: vi.fn(),
  subscriptionCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: mocks.userCount,
      findMany: mocks.userFindMany,
    },
    message: {
      count: mocks.messageCount,
      aggregate: mocks.messageAggregate,
      findMany: mocks.messageFindMany,
      groupBy: mocks.messageGroupBy,
    },
    ragDocument: {
      count: mocks.ragDocumentCount,
    },
    subscription: {
      count: mocks.subscriptionCount,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/analytics", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.userCount.mockReset();
    mocks.userFindMany.mockReset();
    mocks.messageCount.mockReset();
    mocks.messageAggregate.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageGroupBy.mockReset();
    mocks.ragDocumentCount.mockReset();
    mocks.subscriptionCount.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });

    mocks.userCount.mockResolvedValue(10);
    mocks.messageCount.mockResolvedValue(50);
    mocks.messageAggregate.mockResolvedValue({
      _sum: {
        costUsd: 5,
        outputTokens: 1000,
        reasoningTokens: 200,
      },
      _avg: {
        costUsd: 0.5,
        outputTokens: 20,
        generationTimeMs: 500,
      },
      _count: 10,
    });
    mocks.ragDocumentCount.mockResolvedValue(4);
    mocks.messageFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        userId: "u1",
        role: "USER",
        costUsd: 1,
      },
      {
        createdAt: new Date("2026-02-15T12:00:00.000Z"),
        userId: "u1",
        role: "ASSISTANT",
        costUsd: 2,
      },
    ]);
    mocks.userFindMany.mockResolvedValue([
      {
        id: "u1",
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
      },
    ]);
    mocks.messageGroupBy
      .mockResolvedValueOnce([
        { userId: "u1", _count: 12 },
        { userId: "u2", _count: 1 },
      ])
      .mockResolvedValueOnce([{ userId: "u1" }]);
    mocks.subscriptionCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
  });

  it("returns requireAdmin error response when unauthorized", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/analytics") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns overview analytics", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/analytics?type=overview",
      ) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalUsers: 10,
      newUsersInPeriod: 10,
      totalMessages: 50,
      messagesInPeriod: 50,
      totalCostUsd: 5,
      costInPeriod: 5,
      avgMessagesPerUser: 5,
      costPerUser: 0.5,
      ragDocuments: 4,
    });
  });

  it("returns usage analytics", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/analytics?type=usage") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      messagesByDay: { "2026-02-15": 2 },
      usersByDay: { "2026-02-15": 1 },
      messageDistribution: {
        "0": 8,
        "1-10": 1,
        "11-50": 1,
        "51-100": 0,
        "101-500": 0,
        "500+": 0,
      },
      activeUsersInPeriod: 1,
      totalUsers: 10,
    });
  });

  it("returns cost analytics", async () => {
    // Clear one-time mock queue configured in beforeEach for usage/funnel paths.
    mocks.messageGroupBy.mockReset();
    mocks.messageGroupBy.mockResolvedValue([
      { model: "gpt-4", _sum: { costUsd: 2.5 }, _count: 5 },
    ]);

    const response = await GET(
      new Request("http://localhost/api/admin/analytics?type=costs") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalCostUsd: 5,
      totalOutputTokens: 1000,
      totalReasoningTokens: 200,
      avgCostPerMessage: 0.5,
      avgOutputTokens: 20,
      avgGenerationTimeMs: 500,
      assistantMessageCount: 10,
      costByModel: [
        {
          model: "gpt-4",
          totalCost: 2.5,
          messageCount: 5,
        },
      ],
      costByDay: { "2026-02-15": 3 },
    });
  });

  it("returns funnel analytics", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/analytics?type=funnel") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      funnel: {
        signup: 1,
        firstChat: 1,
        session3: 0,
        upgrade: 1,
        signupAll: 1,
        firstChatAll: 1,
        session3All: 0,
        upgradeAll: 1,
      },
      conversionRates: {
        signupToFirstChat: 100,
        firstChatToSession3: 0,
        session3ToUpgrade: 0,
        overall: 100,
        signupToFirstChatAll: 100,
        firstChatToSession3All: 0,
        session3ToUpgradeAll: 0,
        overallAll: 100,
      },
    });
  });

  it("returns 400 for invalid type", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/analytics?type=invalid") as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid type" });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.userCount.mockRejectedValue(new Error("db down"));

    const response = await GET(
      new Request(
        "http://localhost/api/admin/analytics?type=overview",
      ) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch analytics",
    });
  });
});
