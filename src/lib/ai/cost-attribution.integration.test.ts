import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser } from "@/test/integration/factories";
import {
  getOperationCostBreakdown,
  recordAiOperation,
} from "./cost-attribution";
import { trackSupportAiUsage } from "./usage-meter";

const modelId = `integration-cost-${randomUUID()}`;
let userId: string | undefined;

afterAll(async () => {
  await prisma.dailyAiOperationUsage.deleteMany({ where: { model: modelId } });
  if (userId) {
    await prisma.dailyUsage.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
});

describe("durable operational costs", () => {
  it("aggregates concurrent calls and leaves existing quota totals unduplicated", async () => {
    userId = (await createUser()).id;
    await Promise.all(
      [1, 2].map(() =>
        trackSupportAiUsage({
          operation: "memory_extraction",
          userId,
          modelId,
          usage: { inputTokens: 100, outputTokens: 20 },
          providerMetadata: {
            openrouter: {
              usage: {
                cost: 0.004,
                prompt_tokens_details: {
                  cached_tokens: 70,
                  cache_write_tokens: 10,
                },
              },
            },
          },
        }),
      ),
    );
    const quotaBefore = await prisma.dailyUsage.findFirstOrThrow({
      where: { userId },
    });
    expect(quotaBefore).toMatchObject({
      requestCount: 0,
      inputTokens: 200,
      outputTokens: 40,
      totalCostUsd: 0.008,
    });

    await recordAiOperation({
      operation: "embeddings",
      modelId,
      providerMetadata: {
        openrouter: { usage: { input_tokens: 50, cost: 0.001 } },
      },
    });
    await recordAiOperation({ operation: "embeddings", modelId, failed: true });
    const breakdown = await getOperationCostBreakdown(null);
    expect(breakdown.operations.filter((row) => row.model === modelId)).toEqual(
      [
        expect.objectContaining({
          operation: "embeddings",
          calls: 2,
          failedCalls: 1,
          providerReportedCostUsd: 0.001,
          unknownCostCalls: 1,
        }),
        expect.objectContaining({
          operation: "memory_extraction",
          calls: 2,
          inputTokens: 200,
          outputTokens: 40,
          cacheReadTokens: 140,
          cacheWriteTokens: 20,
          cacheReadObservedCalls: 2,
          cacheWriteObservedCalls: 2,
          providerReportedCostUsd: 0.008,
          estimatedCostUsd: 0,
          unknownCostCalls: 0,
        }),
      ],
    );
    expect(
      await prisma.dailyUsage.findFirstOrThrow({ where: { userId } }),
    ).toEqual(quotaBefore);
  });
});
