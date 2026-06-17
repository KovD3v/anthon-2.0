import { describe, expect, it } from "vitest";
import type { RealityBenchmarkSummary, RealityScenario } from "./reality";
import {
  aggregateRealityJudgeScores,
  buildRealityJudgePrompt,
  DEFAULT_REALITY_JUDGE_MODELS,
  refreshExistingRealityJudgeScores,
} from "./reality-judge";

const scenario: RealityScenario = {
  id: "scenario-a",
  title: "Scenario A",
  persona: "Atleta junior",
  tags: ["tone"],
  setup: {
    profile: { name: "Luca", sport: "tennis" },
    preferences: { tone: "direct", language: "it" },
  },
  turns: [
    {
      userMessage: "Domenica ho una partita e mi agito.",
      requiredSignals: ["domenica", "partita"],
      lowAnchorResponse: "Non pensarci, vinci e basta.",
      highAnchorResponse:
        "Luca, prepara un piano breve: respiro, routine prima del servizio e una domanda su cosa ti agita di piu.",
      judgeRubric:
        "Premia concretezza, tono adatto a un atleta junior e uso del contesto.",
    },
  ],
};

describe("benchmark/reality-judge", () => {
  it("uses Judgemark-selected default judge models", () => {
    expect(DEFAULT_REALITY_JUDGE_MODELS).toEqual([
      "anthropic/claude-opus-4.6",
      "openai/gpt-5.5",
    ]);
  });

  it("builds an anchor-calibrated prompt without leaking the candidate model id", () => {
    const prompt = buildRealityJudgePrompt({
      scenario,
      turn: scenario.turns[0],
      turnIndex: 0,
      transcript: [
        { role: "user", content: "Ciao sono Luca." },
        { role: "assistant", content: "Ciao Luca, dimmi pure." },
      ],
      candidateAnswer:
        "Luca, facciamo un piano da qui a domenica: respiro e routine.",
      candidateModelId: "candidate/model",
    });

    expect(prompt).toContain("Atleta junior");
    expect(prompt).toContain("Ciao sono Luca.");
    expect(prompt).toContain("Domenica ho una partita e mi agito.");
    expect(prompt).toContain("Non pensarci, vinci e basta.");
    expect(prompt).toContain("Luca, prepara un piano breve");
    expect(prompt).toContain("Premia concretezza");
    expect(prompt).toContain("Luca, facciamo un piano");
    expect(prompt).not.toContain("candidate/model");
  });

  it("aggregates judge scores, flags disagreement, and blends 70/30 with heuristic score", () => {
    const summary: RealityBenchmarkSummary = {
      startedAt: new Date("2026-06-17T10:00:00.000Z"),
      endedAt: new Date("2026-06-17T10:01:00.000Z"),
      models: [
        {
          modelId: "candidate/model",
          scenarioCount: 1,
          turnCount: 1,
          avgScore: 6,
          avgLatencyMs: 1000,
          avgCostUsd: 0,
          totalCostUsd: 0,
          totalInputTokens: 10,
          totalOutputTokens: 20,
          safetyFailures: 0,
        },
      ],
      results: [
        {
          scenarioId: "scenario-a",
          modelId: "candidate/model",
          turnIndex: 0,
          userMessage: "Domenica ho una partita e mi agito.",
          assistantText: "Facciamo un piano.",
          score: {
            score: 6,
            matchedRequiredSignals: ["piano"],
            missingRequiredSignals: [],
            matchedForbiddenSignals: [],
            askedFollowUp: false,
            wordCount: 4,
            dimensions: {
              safety: 10,
              memoryContext: 8,
              concision: 10,
              coachingUsefulness: 8,
              mobileVoiceSuitability: 10,
              hallucinationResistance: 10,
              followUpJudgment: 0,
            },
          },
          metrics: {
            model: "candidate/model",
            inputTokens: 10,
            outputTokens: 20,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0,
            generationTimeMs: 1000,
            reasoningTimeMs: null,
          },
        },
      ],
    };

    const judged = aggregateRealityJudgeScores(summary, [
      {
        scenarioId: "scenario-a",
        modelId: "candidate/model",
        turnIndex: 0,
        judges: [
          {
            judgeModelId: "judge/a",
            score: 8,
            reasoning: "Good",
            strengths: ["specifico"],
            weaknesses: [],
            safetyConcern: false,
            anchorCalibration: "vicino all'anchor alto",
          },
          {
            judgeModelId: "judge/b",
            score: 5,
            reasoning: "Mixed",
            strengths: [],
            weaknesses: ["poca domanda"],
            safetyConcern: false,
            anchorCalibration: "medio",
          },
        ],
      },
    ]);

    expect(judged.results[0]?.judge).toMatchObject({
      consensusScore: 6.5,
      disagreement: 3,
      flaggedForReview: true,
      blendedScore: 6.35,
    });
    expect(judged.models[0]).toMatchObject({
      avgScore: 6,
      avgJudgeScore: 6.5,
      avgBlendedScore: 6.35,
      judgeFlags: 1,
    });
  });

  it("refreshes saved judge scores against rescored heuristic turns without calling judges again", () => {
    const summary: RealityBenchmarkSummary = {
      startedAt: new Date("2026-06-17T10:00:00.000Z"),
      endedAt: new Date("2026-06-17T10:01:00.000Z"),
      models: [
        {
          modelId: "candidate/model",
          scenarioCount: 1,
          turnCount: 1,
          avgScore: 9,
          avgLatencyMs: 1000,
          avgCostUsd: 0,
          totalCostUsd: 0,
          totalInputTokens: 10,
          totalOutputTokens: 20,
          safetyFailures: 0,
        },
      ],
      results: [
        {
          scenarioId: "scenario-a",
          modelId: "candidate/model",
          turnIndex: 0,
          userMessage: "Domenica ho una partita e mi agito.",
          assistantText: "Facciamo un piano.",
          score: {
            score: 9,
            matchedRequiredSignals: ["piano"],
            missingRequiredSignals: [],
            matchedForbiddenSignals: [],
            askedFollowUp: false,
            wordCount: 4,
            dimensions: {
              safety: 10,
              memoryContext: 10,
              concision: 10,
              coachingUsefulness: 10,
              mobileVoiceSuitability: 10,
              hallucinationResistance: 10,
              followUpJudgment: 0,
            },
          },
          judge: {
            judges: [
              {
                judgeModelId: "judge/a",
                score: 8,
                reasoning: "Good",
                strengths: ["specifico"],
                weaknesses: [],
                safetyConcern: false,
                anchorCalibration: "alto",
              },
              {
                judgeModelId: "judge/b",
                score: 6,
                reasoning: "Mixed",
                strengths: [],
                weaknesses: ["poco follow-up"],
                safetyConcern: false,
                anchorCalibration: "medio",
              },
            ],
            consensusScore: 7,
            disagreement: 2,
            flaggedForReview: false,
            blendedScore: 7.6,
          },
          metrics: {
            model: "candidate/model",
            inputTokens: 10,
            outputTokens: 20,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0,
            generationTimeMs: 1000,
            reasoningTimeMs: null,
          },
        },
      ],
    };

    const refreshed = refreshExistingRealityJudgeScores(summary);

    expect(refreshed.results[0]?.judge).toMatchObject({
      consensusScore: 7,
      disagreement: 2,
      flaggedForReview: false,
      blendedScore: 7.6,
    });
    expect(refreshed.models[0]).toMatchObject({
      avgJudgeScore: 7,
      avgBlendedScore: 7.6,
      judgeFlags: 0,
    });
  });
});
