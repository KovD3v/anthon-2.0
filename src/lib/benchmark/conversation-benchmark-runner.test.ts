import { describe, expect, it } from "vitest";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
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
});

const dimensions = {
  contextUse: 5,
  conversationalNaturalness: 5,
  discoveryBeforeAdvice: 5,
  multiTurnProgression: 5,
  questionQuality: 5,
};
