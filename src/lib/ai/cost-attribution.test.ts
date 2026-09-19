import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  groupBy: vi.fn(),
  calculateCost: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    dailyAiOperationUsage: {
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
      groupBy: mocks.groupBy,
    },
  },
}));
vi.mock("./tokenlens", () => ({ calculateCost: mocks.calculateCost }));

import {
  costAttributionCutoff,
  deleteExpiredCostAttribution,
  getOperationCostBreakdown,
  operationUsageCounters,
  recordAiOperation,
  recordAiOperationFailure,
} from "./cost-attribution";

describe("anonymous operation cost attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calculateCost.mockReturnValue({ totalCost: 0, pricingKnown: false });
    mocks.upsert.mockResolvedValue({});
  });

  it("prefers reported cost and retains raw cache writes plus SDK cache reads", async () => {
    await recordAiOperation({
      operation: "coaching",
      modelId: "provider/model",
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        raw: {
          prompt_tokens_details: { cached_tokens: 70, cache_write_tokens: 20 },
        },
      },
      providerMetadata: {
        openrouter: {
          usage: {
            promptTokens: 100,
            completionTokens: 10,
            cost: "0.001",
            promptTokensDetails: { cachedTokens: 70 },
            completionTokensDetails: { reasoningTokens: 3 },
          },
        },
        privateText: "must never be stored",
      },
    });
    const write = mocks.upsert.mock.calls[0][0];
    expect(write.create).toMatchObject({
      operation: "coaching",
      model: "provider/model",
      calls: 1,
      inputTokens: 100,
      outputTokens: 10,
      reasoningTokens: 3,
      cacheReadTokens: 70,
      cacheWriteTokens: 20,
      cacheReadObservedCalls: 1,
      cacheWriteObservedCalls: 1,
      providerReportedCostUsd: 0.001,
      estimatedCostUsd: 0,
      unknownCostCalls: 0,
    });
    expect(write.update.calls).toEqual({ increment: 1 });
    expect(JSON.stringify(write)).not.toContain("must never be stored");
    expect(mocks.calculateCost).not.toHaveBeenCalled();
  });

  it("distinguishes reported zero, estimated cost and unknown cost", () => {
    const input = {
      operation: "embeddings" as const,
      modelId: "model",
      usage: { inputTokens: 100 },
    };
    expect(
      operationUsageCounters({
        ...input,
        providerMetadata: { openrouter: { usage: { cost: 0 } } },
      }),
    ).toMatchObject({ unknownCostCalls: 0, providerReportedCostUsd: 0 });
    expect(operationUsageCounters(input)).toMatchObject({
      unknownCostCalls: 1,
      estimatedCostUsd: 0,
    });
    mocks.calculateCost.mockReturnValue({
      totalCost: 0.002,
      pricingKnown: true,
    });
    expect(operationUsageCounters(input)).toMatchObject({
      unknownCostCalls: 0,
      estimatedCostUsd: 0.002,
      providerReportedCostUsd: 0,
    });
  });

  it("does not describe the adapter's synthetic zero as observed cache usage", () => {
    expect(
      operationUsageCounters({
        operation: "coaching",
        modelId: "model",
        usage: {
          inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: undefined,
            noCacheTokens: 100,
          },
        },
        providerMetadata: { openrouter: { usage: { promptTokens: 100 } } },
      }),
    ).toMatchObject({
      cacheReadTokens: 0,
      cacheReadObservedCalls: 0,
      cacheWriteObservedCalls: 0,
    });
  });

  it("records exposed retry attempts and preserves missing cost instead of assuming free", async () => {
    await recordAiOperationFailure("memory_extraction", "model", {
      errors: [
        {
          usage: { inputTokens: 5 },
          providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
          text: "private",
        },
        new Error("private upstream error"),
      ],
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({
      failedCalls: 1,
      providerReportedCostUsd: 0.01,
      unknownCostCalls: 0,
    });
    expect(mocks.upsert.mock.calls[1][0].create).toMatchObject({
      failedCalls: 1,
      unknownCostCalls: 1,
    });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("private");
  });

  it("does not fail the response when attribution storage fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("database unavailable"));
    await expect(
      recordAiOperation({ operation: "coaching", modelId: "model" }),
    ).resolves.toBeUndefined();
  });

  it("extracts error response usage without retaining the response body", async () => {
    await recordAiOperationFailure("transcription", "model", {
      responseBody: JSON.stringify({
        error: { message: "private upstream content" },
        usage: { input_tokens: 25, cost: 0.003 },
      }),
    });
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({
      inputTokens: 25,
      failedCalls: 1,
      providerReportedCostUsd: 0.003,
      unknownCostCalls: 0,
    });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("private");
  });

  it("bounds aggregate retention and all-time admin queries to 90 UTC dates", async () => {
    expect(costAttributionCutoff(new Date("2026-09-19T23:30:00Z"))).toEqual(
      new Date("2026-06-22T00:00:00Z"),
    );
    mocks.groupBy.mockResolvedValue([]);
    await expect(getOperationCostBreakdown(null)).resolves.toEqual({
      retentionDays: 90,
      observedFrom: null,
      operations: [],
    });
    const cutoff = mocks.groupBy.mock.calls[0][0].where.date.gte;
    await deleteExpiredCostAttribution();
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { date: { lt: cutoff } },
    });
  });
});
