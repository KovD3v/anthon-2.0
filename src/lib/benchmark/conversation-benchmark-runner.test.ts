import { describe, expect, it } from "vitest";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import { runConversationVariant } from "./conversation-benchmark-runner";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";
import type { RealityBenchmarkExecutor } from "./reality";

const metrics: AIMetrics = {
  model: "openai/gpt-5.6-luna",
  inputTokens: 10,
  outputTokens: 10,
  reasoningTokens: 0,
  toolCalls: [],
  ragUsed: false,
  ragChunksCount: 0,
  costUsd: 0,
  generationTimeMs: 100,
  reasoningTimeMs: 0,
};

describe("benchmark/conversation-benchmark-runner", () => {
  it("creates independent, complete replicas for every sample", async () => {
    const artifact = await runConversationVariant({
      variant: "baseline",
      label: "before",
      commit: "a".repeat(40),
      samples: 3,
      configurationFingerprint: "config",
      executorFactory: (replicaId) => {
        const executor: RealityBenchmarkExecutor = async ({
          scenario,
          turnIndex,
        }) => ({
          text: `${scenario.id}:${turnIndex}:${replicaId}`,
          metrics,
        });
        return { executor, cleanup: async () => undefined };
      },
    });

    const turnCount = CONVERSATIONAL_REALITY_SCENARIOS.reduce(
      (sum, scenario) => sum + scenario.turns.length,
      0,
    );
    expect(artifact.replicas).toHaveLength(turnCount * 3);
    expect(
      new Set(artifact.replicas.map((replica) => replica.replicaId)),
    ).toEqual(new Set(["sample-1", "sample-2", "sample-3"]));
    expect(artifact.modelId).toBe("openai/gpt-5.6-luna");
  });

  it("rejects empty candidate output", async () => {
    await expect(
      runConversationVariant({
        variant: "candidate",
        label: "after",
        commit: "b".repeat(40),
        samples: 1,
        configurationFingerprint: "config",
        executorFactory: () => ({
          executor: async () => ({ text: "", metrics }),
          cleanup: async () => undefined,
        }),
      }),
    ).rejects.toThrow(/incomplete/);
  });
});
