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
  arbitrateTurn: vi.fn(),
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

vi.mock("@/lib/ai/turn-arbitration", () => ({
  arbitrateTurn: mocks.arbitrateTurn,
}));

import type { CapabilityDecision } from "@/lib/ai/capability-arbitration";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import type { ExecutionRouteTrace } from "@/lib/ai/execution-route-trace";
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

const metrics = {
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
} as unknown as AIMetrics;

function escalatedExecutionRoute(): ExecutionRouteTrace {
  return {
    schemaVersion: 1,
    routingMode: "active",
    policyVersion: 1,
    classifierVersion: 1,
    eligibleProfile: "light",
    plannedProfile: "light",
    executedProfile: "standard",
    taskKind: "rewrite",
    decisionSource: "classifier",
    confidenceBucket: "high",
    reasonCodes: ["classifier_light", "task_allowlisted"],
    classificationLatencyMs: 14,
    routingOverheadMs: 3,
    totalRequestTimeToFirstTokenMs: 210,
    attempts: [
      {
        sequence: 1,
        profile: "light",
        outcome: "failed_before_stream",
        generationTimeMs: 40,
        inputTokens: 10,
        costUsd: 0.001,
      },
      {
        sequence: 2,
        profile: "standard",
        outcome: "completed",
        timeToFirstTokenMs: 150,
        generationTimeMs: 300,
        inputTokens: 30,
        outputTokens: 20,
        reasoningTokens: 4,
        costUsd: 0.006,
      },
    ],
    escalation: {
      from: "light",
      to: "standard",
      reason: "empty_response",
    },
  };
}

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

  it("strips legacy raw metadata from recovery without invoking a second reservation", async () => {
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
      recovery: {
        text: "saved provider output",
        metrics: {
          model: "test/model",
          provider: "test-provider",
        },
      },
    });
    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.metrics).not.toHaveProperty("providerMetadata");
    expect(result.recovery.metrics).not.toHaveProperty("reasoningContent");
    expect(JSON.stringify(result)).not.toContain("shouldNotBeRecovered");
    expect(JSON.stringify(result)).not.toContain("private chain");
    expect(mocks.dailyUsageFindUnique).not.toHaveBeenCalled();
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
  });

  it("restores only closed capability metadata from agentic recovery", async () => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: {
          ...metrics,
          capabilityPlanner: {
            mode: "agentic",
            decision: {
              rag: true,
              webSearch: false,
              webFetch: false,
              memoryRead: true,
              memoryWrite: false,
              memoryDelete: true,
              memoryDeleteTarget: "private_memory_key",
              routineProposal: false,
              userContext: true,
              voiceOutput: false,
              source: "mixed",
              reasonCodes: [],
              rawPayload: "must not survive",
            },
          },
        },
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.capabilityMetadataValid).toBe(true);
    expect(result.recovery.capabilityPlannerMode).toBe("agentic");
    expect(result.recovery.capabilityDecision).toMatchObject({
      rag: true,
      memoryRead: true,
      memoryDelete: true,
      memoryDeleteTarget: null,
      source: "mixed",
    });
    expect(result.recovery.metrics).not.toHaveProperty("capabilityPlanner");
    expect(JSON.stringify(result)).not.toContain("private_memory_key");
    expect(JSON.stringify(result)).not.toContain("must not survive");
  });

  it("restores a valid legacy recovery marker without a decision", async () => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: {
          ...metrics,
          capabilityPlanner: { mode: "legacy" },
        },
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.capabilityMetadataValid).toBe(true);
    expect(result.recovery.capabilityPlannerMode).toBe("legacy");
    expect(result.recovery.capabilityDecision).toBeUndefined();
    expect(result.recovery.executionMetadataValid).toBe(false);
    expect(result.recovery.executionRoute).toBeUndefined();
    expect(result.recovery.executionRoute?.executedProfile ?? "standard").toBe(
      "standard",
    );
  });

  it("restores a valid route as independently validated frozen metadata", async () => {
    const executionRoute = escalatedExecutionRoute();
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: {
          ...metrics,
          executionRoute,
        },
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.capabilityMetadataValid).toBe(false);
    expect(result.recovery.executionMetadataValid).toBe(true);
    expect(result.recovery.executionRoute).toEqual(executionRoute);
    expect(Object.isFrozen(result.recovery.executionRoute)).toBe(true);
    expect(Object.isFrozen(result.recovery.executionRoute?.reasonCodes)).toBe(
      true,
    );
    expect(Object.isFrozen(result.recovery.executionRoute?.attempts)).toBe(
      true,
    );
    expect(Object.isFrozen(result.recovery.executionRoute?.attempts[0])).toBe(
      true,
    );
    expect(Object.isFrozen(result.recovery.executionRoute?.escalation)).toBe(
      true,
    );
    expect(result.recovery.metrics).not.toHaveProperty("executionRoute");
    expect(mocks.arbitrateTurn).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", { executedProfile: "turbo" }],
    ["version", { schemaVersion: 2 }],
    ["attempt", { attempts: [] }],
    ["reason code", { reasonCodes: ["raw_classifier_prose"] }],
  ])("rejects malformed execution %s metadata", async (_label, override) => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: {
          ...metrics,
          capabilityPlanner: { mode: "legacy" },
          executionRoute: {
            ...escalatedExecutionRoute(),
            ...override,
          },
        },
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.capabilityMetadataValid).toBe(true);
    expect(result.recovery.executionMetadataValid).toBe(false);
    expect(result.recovery.executionRoute).toBeUndefined();
    expect(result.recovery.metrics).not.toHaveProperty("executionRoute");
    expect(mocks.arbitrateTurn).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing agentic decision",
      capabilityPlanner: { mode: "agentic" },
    },
    {
      label: "incomplete agentic decision",
      capabilityPlanner: {
        mode: "agentic",
        decision: {
          rag: false,
          webSearch: false,
          webFetch: false,
          memoryRead: false,
          memoryWrite: false,
          memoryDelete: false,
          routineProposal: false,
          userContext: false,
          voiceOutput: false,
          source: "fallback",
        },
      },
    },
    {
      label: "legacy with decision",
      capabilityPlanner: {
        mode: "legacy",
        decision: {},
      },
    },
    {
      label: "invalid source",
      capabilityPlanner: {
        mode: "agentic",
        decision: {
          rag: false,
          webSearch: false,
          webFetch: false,
          memoryRead: false,
          memoryWrite: false,
          memoryDelete: false,
          routineProposal: false,
          userContext: false,
          voiceOutput: false,
          source: "untrusted",
          reasonCodes: [],
        },
      },
    },
    {
      label: "invalid reason codes",
      capabilityPlanner: {
        mode: "agentic",
        decision: {
          rag: false,
          webSearch: false,
          webFetch: false,
          memoryRead: false,
          memoryWrite: false,
          memoryDelete: false,
          routineProposal: false,
          userContext: false,
          voiceOutput: false,
          source: "fallback",
          reasonCodes: [{ raw: "payload" }],
        },
      },
    },
  ])(
    "fails closed on $label recovery metadata",
    async ({ capabilityPlanner }) => {
      mocks.reservationFindUnique.mockResolvedValue(
        reservation({
          status: "RECONCILED",
          recoveryText: "saved provider output",
          recoveryMetrics: {
            ...metrics,
            capabilityPlanner,
          },
        }),
      );

      const result = await reserveAiUsage({
        userId: "user-1",
        requestKey: "message-1",
        limits: finiteLimits,
      });

      if (!result.allowed || !result.recovery) {
        throw new Error("Expected a recovered result");
      }
      expect(result.recovery.capabilityMetadataValid).toBe(false);
      expect(result.recovery.capabilityPlannerMode).toBeUndefined();
      expect(result.recovery.capabilityDecision).toBeUndefined();
    },
  );

  it("marks missing or invalid recovery planner metadata as unsafe", async () => {
    mocks.reservationFindUnique.mockResolvedValue(
      reservation({
        status: "RECONCILED",
        recoveryText: "saved provider output",
        recoveryMetrics: {
          ...metrics,
          capabilityPlanner: { mode: "unexpected" },
        },
      }),
    );

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    if (!result.allowed || !result.recovery) {
      throw new Error("Expected a recovered result");
    }
    expect(result.recovery.capabilityMetadataValid).toBe(false);
    expect(result.recovery.capabilityPlannerMode).toBeUndefined();
    expect(result.recovery.capabilityDecision).toBeUndefined();
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

    const result = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });

    expect(result).toMatchObject({
      allowed: true,
      persistedAssistant: {
        messageId: "assistant-1",
        text: "persisted answer",
        metrics: { inputTokens: 4, outputTokens: 2 },
      },
    });
    if (!result.allowed || !result.persistedAssistant) {
      throw new Error("Expected a persisted assistant replay");
    }
    expect(result.persistedAssistant.metrics).not.toHaveProperty(
      "providerMetadata",
    );
    expect(result.persistedAssistant.metrics).not.toHaveProperty(
      "reasoningContent",
    );
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
    const capabilityDecision = {
      rag: true,
      webSearch: false,
      webFetch: false,
      memoryRead: true,
      memoryWrite: false,
      memoryDelete: true,
      memoryDeleteTarget: "private_memory_key",
      routineProposal: false,
      userContext: true,
      voiceOutput: false,
      source: "mixed" as const,
      reasonCodes: [],
    } satisfies CapabilityDecision;
    const executionRoute = escalatedExecutionRoute();
    const routedMetrics = {
      ...metrics,
      inputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 4,
      costUsd: 0.007,
      executionRoute,
    } satisfies AIMetrics;

    await expect(
      reconcileAiUsageForRecovery({
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        text: longText,
        metrics: routedMetrics,
        capabilityPlannerMode: "agentic",
        capabilityDecision,
      }),
    ).resolves.toEqual({ charged: true });
    await expect(
      reconcileAiUsageForRecovery({
        reservationId: "reservation-1",
        claimToken: "claim-current",
        userId: "user-1",
        text: longText,
        metrics: routedMetrics,
        capabilityPlannerMode: "agentic",
        capabilityDecision,
      }),
    ).resolves.toEqual({ charged: false });

    expect(mocks.dailyUsageUpsert).toHaveBeenCalledTimes(1);
    const persisted = mocks.reservationUpdate.mock.calls[0]?.[0].data;
    expect(persisted.recoveryText).toHaveLength(128 * 1024);
    expect(persisted.recoveryMetrics).toMatchObject({
      model: "test/model",
      inputTokens: 40,
      outputTokens: 20,
      toolCalls: null,
      capabilityPlanner: {
        mode: "agentic",
        decision: {
          rag: true,
          memoryRead: true,
          memoryDelete: true,
          source: "mixed",
        },
      },
    });
    expect(persisted.recoveryMetrics).not.toHaveProperty("reasoningContent");
    expect(persisted.recoveryMetrics).not.toHaveProperty("providerMetadata");
    expect(JSON.stringify(persisted.recoveryMetrics)).not.toContain(
      "private_memory_key",
    );
    expect(
      persisted.recoveryMetrics.capabilityPlanner.decision,
    ).not.toHaveProperty("memoryDeleteTarget");
    expect(persisted.recoveryExpiresAt).toBeInstanceOf(Date);

    expect(persisted.recoveryMetrics).toMatchObject({
      inputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 4,
      costUsd: 0.007,
      executionRoute,
    });

    const recovered = await reserveAiUsage({
      userId: "user-1",
      requestKey: "message-1",
      limits: finiteLimits,
    });
    if (!recovered.allowed || !recovered.recovery) {
      throw new Error("Expected routed recovery");
    }
    expect(recovered.recovery.metrics).toMatchObject({
      inputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 4,
      costUsd: 0.007,
    });
    expect(recovered.recovery.executionRoute?.attempts).toHaveLength(2);
    expect(recovered.recovery.executionMetadataValid).toBe(true);
    expect(mocks.arbitrateTurn).not.toHaveBeenCalled();
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
