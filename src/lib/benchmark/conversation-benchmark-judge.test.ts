import { describe, expect, it } from "vitest";
import {
  assignBlindVariants,
  buildConversationPairwiseJudgePrompt,
  ConversationPairwiseJudgeOutputSchema,
  ConversationPairwiseJudgeProviderSchema,
  revealSafetyRegression,
} from "./conversation-benchmark-judge";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";

const dimensions = {
  contextUse: 8,
  conversationalNaturalness: 8,
  discoveryBeforeAdvice: 8,
  multiTurnProgression: 8,
  questionQuality: 8,
};

describe("benchmark/conversation-benchmark-judge", () => {
  it("assigns variants deterministically without pinning every pair to one side", () => {
    const first = assignBlindVariants("scenario-a", 0, "sample-1");
    expect(assignBlindVariants("scenario-a", 0, "sample-1")).toEqual(first);
    const assignments = new Set(
      Array.from({ length: 20 }, (_, index) =>
        JSON.stringify(assignBlindVariants("scenario-a", 0, `sample-${index}`)),
      ),
    );
    expect(assignments.size).toBe(2);
  });

  it("keeps variant, model, and commit identity out of the prompt", () => {
    const scenario = CONVERSATIONAL_REALITY_SCENARIOS[0];
    const prompt = buildConversationPairwiseJudgePrompt({
      scenario,
      turnIndex: 1,
      transcriptA: [
        { role: "user", content: scenario.turns[0].userMessage },
        { role: "assistant", content: "Storico A" },
      ],
      transcriptB: [
        { role: "user", content: scenario.turns[0].userMessage },
        { role: "assistant", content: "Storico B" },
      ],
      answerA: "Risposta A",
      answerB: "Risposta B",
    });
    expect(prompt).toContain("Risposta A");
    expect(prompt).toContain("Risposta B");
    expect(prompt).toContain("Storico A");
    expect(prompt).toContain("Storico B");
    expect(prompt).toContain(scenario.title);
    expect(prompt).not.toMatch(/baseline|candidate|openai\/gpt|[a-f0-9]{40}/i);
  });

  it("rejects invalid verdicts and out-of-range dimensions", () => {
    expect(() =>
      ConversationPairwiseJudgeOutputSchema.parse({
        preferred: "maybe",
        dimensionsA: { ...dimensions, questionQuality: 11 },
        dimensionsB: dimensions,
        reason: "test",
        strengthsA: [],
        strengthsB: [],
        weaknessesA: [],
        weaknessesB: [],
        safetyRegression: "neither",
      }),
    ).toThrow();
  });

  it("keeps provider JSON Schema free of unsupported numeric bounds", () => {
    const providerPayload = {
      preferred: "tie" as const,
      dimensionsA: { ...dimensions, questionQuality: 11 },
      dimensionsB: dimensions,
      reason: "test",
      strengthsA: [],
      strengthsB: [],
      weaknessesA: [],
      weaknessesB: [],
      safetyRegression: "neither" as const,
    };

    expect(
      ConversationPairwiseJudgeProviderSchema.safeParse(providerPayload)
        .success,
    ).toBe(true);
    expect(() =>
      ConversationPairwiseJudgeOutputSchema.parse(providerPayload),
    ).toThrow();
  });

  it("reveals which variant carries a safety regression", () => {
    const assignment = { A: "candidate", B: "baseline" } as const;
    expect(revealSafetyRegression("A", assignment)).toBe("candidate");
    expect(revealSafetyRegression("B", assignment)).toBe("baseline");
    expect(revealSafetyRegression("both", assignment)).toBe("both");
    expect(revealSafetyRegression("neither", assignment)).toBe("neither");
  });
});
