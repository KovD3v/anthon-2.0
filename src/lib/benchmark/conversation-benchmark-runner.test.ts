import { describe, expect, it } from "vitest";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import { conversationReplicaKey } from "./conversation-benchmark";
import {
  buildConversationComparison,
  runConversationVariant,
} from "./conversation-benchmark-runner";
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
  tracePayload: { systemPrompt: "private prompt" },
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
    expect(JSON.stringify(artifact)).not.toContain("tracePayload");
    expect(JSON.stringify(artifact)).not.toContain("private prompt");
  });

  it("runs independent samples concurrently", async () => {
    let activeSamples = 0;
    let maxActiveSamples = 0;
    const artifact = await runConversationVariant({
      variant: "candidate",
      label: "concurrent",
      commit: "c".repeat(40),
      samples: 3,
      configurationFingerprint: "config",
      executorFactory: () => {
        activeSamples += 1;
        maxActiveSamples = Math.max(maxActiveSamples, activeSamples);
        return {
          executor: async ({ scenario, turnIndex }) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return { text: `${scenario.id}:${turnIndex}`, metrics };
          },
          cleanup: async () => {
            activeSamples -= 1;
          },
        };
      },
    });

    expect(maxActiveSamples).toBe(3);
    expect(artifact.replicas[0]?.replicaId).toBe("sample-1");
    expect(artifact.replicas.at(-1)?.replicaId).toBe("sample-3");
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

  it("gives judges each variant's complete prior conversation", async () => {
    const makeArtifact = async (variant: "baseline" | "candidate") =>
      runConversationVariant({
        variant,
        label: variant,
        commit: (variant === "baseline" ? "a" : "b").repeat(40),
        samples: 1,
        configurationFingerprint: variant,
        executorFactory: () => ({
          executor: async ({ scenario, turnIndex }) => ({
            text: `${variant}-${scenario.id}-${turnIndex}`,
            metrics,
          }),
          cleanup: async () => undefined,
        }),
      });
    const baseline = await makeArtifact("baseline");
    const candidate = await makeArtifact("candidate");
    const inputs: Array<Record<string, unknown>> = [];
    const judge = async (input: Record<string, unknown>) => {
      inputs.push(input);
      return {
        judgeModelId: "judge",
        costUsd: 0,
        generationTimeMs: 1,
        output: {
          preferred: "tie" as const,
          dimensionsA: dimensions,
          dimensionsB: dimensions,
          reason: "test",
          strengthsA: [],
          strengthsB: [],
          weaknessesA: [],
          weaknessesB: [],
          safetyRegression: "neither" as const,
        },
      };
    };

    await buildConversationComparison({
      baseline,
      candidate,
      judges: [judge, judge],
    });

    const secondTurn = inputs.find((input) => input.turnIndex === 1);
    expect(secondTurn?.transcriptA).toEqual([
      expect.objectContaining({ role: "user" }),
      expect.objectContaining({
        role: "assistant",
        content: expect.stringMatching(/^(baseline|candidate)-.+-0$/),
      }),
    ]);
    expect(secondTurn?.transcriptB).toEqual([
      expect.objectContaining({ role: "user" }),
      expect.objectContaining({
        role: "assistant",
        content: expect.stringMatching(/^(baseline|candidate)-.+-0$/),
      }),
    ]);
    expect(secondTurn?.transcriptA).not.toEqual(secondTurn?.transcriptB);
  });

  it("judges pairs concurrently while preserving artifact order", async () => {
    const baseline = await makeArtifact("baseline");
    const candidate = await makeArtifact("candidate");
    let activePairs = 0;
    let maxActivePairs = 0;
    const delayedJudge = async () => {
      activePairs += 1;
      maxActivePairs = Math.max(maxActivePairs, activePairs);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activePairs -= 1;
      return judgeResult;
    };

    const comparison = await buildConversationComparison({
      baseline,
      candidate,
      judges: [delayedJudge, async () => judgeResult],
      pairConcurrency: 3,
    });

    expect(maxActivePairs).toBeGreaterThan(1);
    expect(maxActivePairs).toBeLessThanOrEqual(3);
    expect(comparison.pairs.map((pair) => pair.key)).toEqual(
      baseline.replicas.map(conversationReplicaKey),
    );
  });
});

const dimensions = {
  contextUse: 5,
  conversationalNaturalness: 5,
  discoveryBeforeAdvice: 5,
  multiTurnProgression: 5,
  questionQuality: 5,
};

const judgeResult = {
  judgeModelId: "judge",
  costUsd: 0,
  generationTimeMs: 1,
  output: {
    preferred: "tie" as const,
    dimensionsA: dimensions,
    dimensionsB: dimensions,
    reason: "test",
    strengthsA: [],
    strengthsB: [],
    weaknessesA: [],
    weaknessesB: [],
    safetyRegression: "neither" as const,
  },
};

async function makeArtifact(variant: "baseline" | "candidate") {
  return runConversationVariant({
    variant,
    label: variant,
    commit: (variant === "baseline" ? "a" : "b").repeat(40),
    samples: 1,
    configurationFingerprint: variant,
    executorFactory: () => ({
      executor: async ({ scenario, turnIndex }) => ({
        text: `${variant}-${scenario.id}-${turnIndex}`,
        metrics,
      }),
      cleanup: async () => undefined,
    }),
  });
}
