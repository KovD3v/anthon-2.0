import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  reservationFindUnique: vi.fn(),
  reservationUpdateMany: vi.fn(),
  reservationDeleteMany: vi.fn(),
  reservationAggregate: vi.fn(),
  reservationCreate: vi.fn(),
  reservationUpdate: vi.fn(),
  dailyUsageFindUnique: vi.fn(),
  dailyUsageUpsert: vi.fn(),
}));

const tx = {
  $queryRaw: mocks.queryRaw,
  aiUsageReservation: {
    findUnique: mocks.reservationFindUnique,
    updateMany: mocks.reservationUpdateMany,
    deleteMany: mocks.reservationDeleteMany,
    aggregate: mocks.reservationAggregate,
    create: mocks.reservationCreate,
    update: mocks.reservationUpdate,
  },
  dailyUsage: {
    findUnique: mocks.dailyUsageFindUnique,
    upsert: mocks.dailyUsageUpsert,
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    aiUsageReservation: {
      updateMany: mocks.reservationUpdateMany,
    },
  },
}));

import type { AIMetrics } from "@/lib/ai/cost-calculator";
import {
  reconcileAiUsageForRecovery,
  reconcileAiUsageInTransaction,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "./reservations";

const finiteLimits = {
  maxRequestsPerDay: 10,
  maxInputTokensPerDay: 1_000,
  maxOutputTokensPerDay: 500,
  maxCostPerDay: 1,
  maxContextMessages: 20,
};

const metrics: AIMetrics = {
  model: "test/model",
  provider: "test-provider",
  providerMetadata: { shouldNotBeRecovered: "large" },
  inputTokens: 12,
  outputTokens: 7,
  reasoningTokens: 3,
  reasoningContent: "private chain",
  toolCalls: [{ name: "search", args: { q: "test" } }],
  toolCallCount: 1,
  toolResultChars: 42,
  ragUsed: true,
  ragChunksCount: 2,
  costUsd: 0.02,
  generationTimeMs: 250,
  reasoningTimeMs: 50,
};

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "reservation-1",
    userId: "user-1",
    requestKey: "message-1",
    date: new Date("2026-07-31T00:00:00.000Z"),
    claimToken: "claim-current",
    status: "RESERVED",
    recoveryText: null,
    recoveryMetrics: null,
    assistantMessage: null,
    reservedInputTokens: 0,
    reservedOutputTokens: 0,
    reservedCostUsd: 0,
    ...overrides,
  };
}

describe("AI usage reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.queryRaw.mockResolvedValue([{ id: "user-1" }]);
    mocks.reservationFindUnique.mockResolvedValue(null);
    mocks.reservationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.reservationDeleteMany.mockResolvedValue({ count: 0 });
    mocks.reservationAggregate.mockResolvedValue({
      _sum: {
        reservedRequests: null,
        reservedInputTokens: null,
        reservedOutputTokens: null,
        reservedCostUsd: null,
      },
      _count: { _all: 0 },
    });
    mocks.reservationCreate.mockImplementation(({ data }) => ({
      id: "reservation-created",
      ...data,
    }));
    mocks.reservationUpdate.mockResolvedValue({});
    mocks.dailyUsageFindUnique.mockResolvedValue(null);
    mocks.dailyUsageUpsert.mockResolvedValue({});
  });

  it("serializes concurrent finite-plan requests behind the user lock", async () => {
    const reservations = new Map<string, ReturnType<typeof reservation>>();
    let transactionTail: Promise<unknown> = Promise.resolve();

    mocks.transaction.mockImplementation((callback) => {
      const result = transactionTail.then(() => callback(tx));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    });
    mocks.reservationFindUnique.mockImplementation(({ where }) => {
      const key = where.userId_requestKey?.requestKey;
      return key ? (reservations.get(key) ?? null) : null;
    });
    mocks.reservationAggregate.mockImplementation(() => {
      const active = [...reservations.values()].filter(
        (entry) => entry.status === "RESERVED",
      );
      return {
        _sum: {
          reservedRequests: active.length,
          reservedInputTokens: active.reduce(
            (sum, entry) => sum + Number(entry.reservedInputTokens ?? 0),
            0,
          ),
          reservedOutputTokens: active.reduce(
            (sum, entry) => sum + Number(entry.reservedOutputTokens ?? 0),
            0,
          ),
          reservedCostUsd: active.reduce(
            (sum, entry) => sum + Number(entry.reservedCostUsd ?? 0),
            0,
          ),
        },
        _count: { _all: active.length },
      };
    });
    mocks.reservationCreate.mockImplementation(({ data }) => {
      const created = reservation({
        ...data,
        id: `reservation-${reservations.size + 1}`,
      });
      reservations.set(String(data.requestKey), created);
      return created;
    });

    const results = await Promise.all([
      reserveAiUsage({
        userId: "user-1",
        requestKey: "message-a",
        limits: finiteLimits,
      }),
      reserveAiUsage({
        userId: "user-1",
        requestKey: "message-b",
        limits: finiteLimits,
      }),
    ]);

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results).toContainEqual({
      allowed: false,
      reason: "Generation already in progress",
      retryable: true,
    });
    expect(mocks.reservationCreate).toHaveBeenCalledTimes(1);
  });

  it("returns bounded recovery without invoking a second reservation", async () => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: metrics,
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    expect(result).toMatchObject({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-current",
      recovery: { text: "saved provider output", metrics },
    });
    expect(mocks.dailyUsageFindUnique).not.toHaveBeenCalled();
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
  });

  it("replays a persisted assistant when recovery payload is no longer present", async () => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        assistantMessage: {
          id: "assistant-1",
          parts: [
            { type: "text", text: "persisted " },
            { type: "text", text: "answer" },
          ],
          model: "test/model",
          inputTokens: 4,
          outputTokens: 2,
          reasoningTokens: null,
          reasoningContent: null,
          toolCalls: null,
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 100,
          reasoningTimeMs: null,
          metrics: null,
        },
      }),
    );

    await expect(
      reserveAiUsage({
        userId: "user-1",
        requestKey: "message-1",
        limits: finiteLimits,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      persistedAssistant: {
        messageId: "assistant-1",
        text: "persisted answer",
        metrics: { inputTokens: 4, outputTokens: 2 },
      },
    });
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
  });

  it("fences reconciliation by the current claim token", async () => {
    mocks.reservationFindUnique.mockResolvedValue(reservation());

    await expect(
      reconcileAiUsageInTransaction(tx as never, {
        reservationId: "reservation-1",
        claimToken: "claim-stale",
        userId: "user-1",
        metrics,
      }),
    ).rejects.toThrow("Usage reservation not found");
    expect(mocks.dailyUsageUpsert).not.toHaveBeenCalled();
    expect(mocks.reservationUpdate).not.toHaveBeenCalled();
  });

  it("charges exactly once when an already-reconciled result is attached", async () => {
    let current = reservation();
    mocks.reservationFindUnique.mockImplementation(() => current);
    mocks.reservationUpdate.mockImplementation(({ data }) => {
      current = { ...current, ...data };
      return current;
    });

    await expect(
      reconcileAiUsageInTransaction(tx as never, {
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        metrics,
        assistantMessageId: "assistant-1",
        allowAlreadyReconciled: true,
      }),
    ).resolves.toEqual({ charged: true });
    await expect(
      reconcileAiUsageInTransaction(tx as never, {
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        metrics,
        assistantMessageId: "assistant-1",
        allowAlreadyReconciled: true,
      }),
    ).resolves.toEqual({ charged: false });

    expect(mocks.dailyUsageUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.reservationUpdate).toHaveBeenLastCalledWith({
      where: { id: "reservation-1" },
      data: expect.objectContaining({
        assistantMessageId: "assistant-1",
        recoveryText: null,
      }),
    });
  });

  it("stores bounded recovery and never charges the retry twice", async () => {
    let current = reservation();
    mocks.reservationFindUnique.mockImplementation(() => current);
    mocks.reservationUpdate.mockImplementation(({ data }) => {
      current = { ...current, ...data };
      return current;
    });
    const longText = "x".repeat(140 * 1024);

    await expect(
      reconcileAiUsageForRecovery({
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        text: longText,
        metrics,
      }),
    ).resolves.toEqual({ charged: true });
    await expect(
      reconcileAiUsageForRecovery({
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        text: longText,
        metrics,
      }),
    ).resolves.toEqual({ charged: false });

    expect(mocks.dailyUsageUpsert).toHaveBeenCalledTimes(1);
    const persisted = mocks.reservationUpdate.mock.calls[0]?.[0].data;
    expect(persisted.recoveryText).toHaveLength(128 * 1024);
    expect(persisted.recoveryMetrics).toMatchObject({
      model: "test/model",
      inputTokens: 12,
      outputTokens: 7,
      reasoningContent: null,
      toolCalls: null,
    });
    expect(persisted.recoveryMetrics).not.toHaveProperty("providerMetadata");
    expect(persisted.recoveryExpiresAt).toBeInstanceOf(Date);
  });

  it("releases only a currently claimed reservation", async () => {
    mocks.reservationUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      releaseAiUsageReservation({
        reservationId: "reservation-1",
        claimToken: "claim-stale",
        userId: "user-1",
      }),
    ).resolves.toBe(false);
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "reservation-1",
        userId: "user-1",
        claimToken: "claim-stale",
        status: "RESERVED",
      },
      data: { status: "RELEASED", releasedAt: expect.any(Date) },
    });
  });
});
