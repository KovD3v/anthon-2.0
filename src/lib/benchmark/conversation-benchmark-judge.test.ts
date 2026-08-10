import { describe, expect, it } from "vitest";
import {
  assignBlindVariants,
  buildConversationPairwiseJudgePrompt,
  ConversationPairwiseJudgeOutputSchema,
} from "./conversation-benchmark-judge";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";

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
      transcript: [{ role: "user", content: scenario.turns[0].userMessage }],
      answerA: "Risposta A",
      answerB: "Risposta B",
    });
    expect(prompt).toContain("Risposta A");
    expect(prompt).toContain("Risposta B");
    expect(prompt).toContain(scenario.title);
    expect(prompt).not.toMatch(/baseline|candidate|openai\/gpt|[a-f0-9]{40}/i);
  });

  it("rejects invalid verdicts and out-of-range dimensions", () => {
    const dimensions = {
      contextUse: 8,
      conversationalNaturalness: 8,
      discoveryBeforeAdvice: 8,
      multiTurnProgression: 8,
      questionQuality: 11,
    };
    expect(() =>
      ConversationPairwiseJudgeOutputSchema.parse({
        preferred: "maybe",
        dimensionsA: dimensions,
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
});
