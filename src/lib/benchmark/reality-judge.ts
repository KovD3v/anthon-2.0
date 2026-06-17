import { generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import type {
  RealityBenchmarkSummary,
  RealityBenchmarkTurnResult,
  RealityJudgeModelScore,
  RealityJudgeTurnScore,
  RealityScenario,
  RealityScenarioTurn,
  RealityTranscriptMessage,
} from "./reality";

export const DEFAULT_REALITY_JUDGE_MODELS = [
  "anthropic/claude-opus-4.6",
  "openai/gpt-5.5",
];

export const REALITY_JUDGE_DISAGREEMENT_THRESHOLD = 2;
export const REALITY_JUDGE_WEIGHT = 0.7;
export const REALITY_HEURISTIC_WEIGHT = 0.3;

const RealityJudgeOutputSchema = z.object({
  score: z.number().min(0).max(10),
  reasoning: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  safetyConcern: z.boolean(),
  anchorCalibration: z.string(),
});

export type RealityJudgeOutput = z.infer<typeof RealityJudgeOutputSchema>;

export type RealityJudgeTurnResult = {
  scenarioId: string;
  modelId: string;
  turnIndex: number;
  judges: RealityJudgeModelScore[];
};

export function buildRealityJudgePrompt({
  scenario,
  turn,
  turnIndex,
  transcript,
  candidateAnswer,
}: {
  scenario: RealityScenario;
  turn: RealityScenarioTurn;
  turnIndex: number;
  transcript: RealityTranscriptMessage[];
  candidateAnswer: string;
  candidateModelId?: string;
}) {
  assertAnchors(turn, scenario.id, turnIndex);

  return [
    "Valuta una risposta di coaching sportivo in italiano usando anchor calibrati.",
    "",
    "Scala:",
    "- 2/10: qualita simile all'anchor basso.",
    "- 9/10: qualita simile all'anchor alto.",
    "- Usa tutto l'intervallo 0-10 quando appropriato.",
    "",
    `Scenario: ${scenario.title}`,
    `Persona: ${scenario.persona}`,
    `Tag: ${scenario.tags.join(", ")}`,
    `Setup: ${JSON.stringify(scenario.setup)}`,
    "",
    "Trascrizione precedente:",
    transcript.length > 0
      ? transcript
          .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
          .join("\n")
      : "(nessuna)",
    "",
    `Turno corrente utente: ${turn.userMessage}`,
    "",
    "Anchor basso, score 2/10:",
    turn.lowAnchorResponse,
    "",
    "Anchor alto, score 9/10:",
    turn.highAnchorResponse,
    "",
    ...(turn.judgeRubric ? ["Rubrica specifica:", turn.judgeRubric, ""] : []),
    "Risposta candidata da valutare:",
    candidateAnswer,
    "",
    "Istruzioni:",
    "- Non valutare in base al nome del modello: non ti viene fornito.",
    "- Premia utilita concreta, sicurezza, uso del contesto, tono e continuita multi-turn.",
    "- Penalizza consigli rischiosi, rifiuti non necessari, genericita, verbosita inutile e mancato rispetto della richiesta.",
    "- Restituisci solo l'oggetto strutturato richiesto.",
  ].join("\n");
}

export async function judgeRealityBenchmarkSummary({
  summary,
  scenarios,
  judgeModels = DEFAULT_REALITY_JUDGE_MODELS,
}: {
  summary: RealityBenchmarkSummary;
  scenarios: RealityScenario[];
  judgeModels?: string[];
}) {
  assertTwoJudgeModels(judgeModels);

  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const judgeResults: RealityJudgeTurnResult[] = [];

  for (const result of summary.results) {
    const scenario = scenarioById.get(result.scenarioId);
    if (!scenario) {
      throw new Error(
        `Missing scenario for judge result: ${result.scenarioId}`,
      );
    }
    const turn = scenario.turns[result.turnIndex];
    if (!turn) {
      throw new Error(
        `Missing scenario turn for judge result: ${result.scenarioId}#${result.turnIndex}`,
      );
    }

    const transcript = buildTranscriptForResult(summary.results, result);
    const judges = await Promise.all(
      judgeModels.map((judgeModelId) =>
        judgeRealityTurn({
          judgeModelId,
          scenario,
          turn,
          turnIndex: result.turnIndex,
          transcript,
          candidateAnswer: result.assistantText,
        }),
      ),
    );

    judgeResults.push({
      scenarioId: result.scenarioId,
      modelId: result.modelId,
      turnIndex: result.turnIndex,
      judges,
    });
  }

  return aggregateRealityJudgeScores(summary, judgeResults);
}

export async function judgeRealityTurn({
  judgeModelId,
  scenario,
  turn,
  turnIndex,
  transcript,
  candidateAnswer,
}: {
  judgeModelId: string;
  scenario: RealityScenario;
  turn: RealityScenarioTurn;
  turnIndex: number;
  transcript: RealityTranscriptMessage[];
  candidateAnswer: string;
}): Promise<RealityJudgeModelScore> {
  const { output } = await generateText({
    model: openrouter(judgeModelId),
    output: Output.object({ schema: RealityJudgeOutputSchema }),
    system:
      "Sei un giudice severo e calibrato di risposte AI per coaching sportivo. Valuti solo la risposta candidata rispetto agli anchor e al contesto.",
    prompt: buildRealityJudgePrompt({
      scenario,
      turn,
      turnIndex,
      transcript,
      candidateAnswer,
    }),
    temperature: 0,
  });

  return {
    judgeModelId,
    score: clampJudgeScore(output?.score ?? 0),
    reasoning: output?.reasoning ?? "Judge failed to return reasoning.",
    strengths: output?.strengths ?? [],
    weaknesses: output?.weaknesses ?? [],
    safetyConcern: output?.safetyConcern ?? false,
    anchorCalibration:
      output?.anchorCalibration ?? "Judge failed to return calibration.",
  };
}

export function aggregateRealityJudgeScores(
  summary: RealityBenchmarkSummary,
  judgeResults: RealityJudgeTurnResult[],
): RealityBenchmarkSummary {
  const judgeByTurn = new Map(
    judgeResults.map((result) => [turnKey(result), result]),
  );

  const results = summary.results.map((result) => ({
    ...result,
    ...(judgeByTurn.get(turnKey(result))
      ? {
          judge: summarizeJudgeTurnForResult(
            judgeByTurn.get(turnKey(result)) as RealityJudgeTurnResult,
            result.score.score,
          ),
        }
      : {}),
  }));

  const models = summary.models.map((model) => {
    const modelResults = results.filter(
      (result) => result.modelId === model.modelId,
    );
    const judgedResults = modelResults.filter((result) => result.judge);
    if (judgedResults.length === 0) {
      return model;
    }

    return {
      ...model,
      avgJudgeScore: average(
        judgedResults.map((result) => result.judge?.consensusScore ?? 0),
      ),
      avgBlendedScore: average(
        judgedResults.map((result) => result.judge?.blendedScore ?? 0),
      ),
      judgeFlags: judgedResults.filter(
        (result) => result.judge?.flaggedForReview,
      ).length,
    };
  });

  return {
    ...summary,
    results,
    models: models.sort((a, b) => {
      const aScore = a.avgBlendedScore ?? a.avgScore;
      const bScore = b.avgBlendedScore ?? b.avgScore;
      return bScore - aScore;
    }),
  };
}

export function assertTwoJudgeModels(judgeModels: string[]) {
  if (judgeModels.length !== 2) {
    throw new Error(
      "Reality benchmark judge mode requires exactly two judge models.",
    );
  }
}

function blendRealityScores(judgeScore: number, heuristicScore: number) {
  return roundScore(
    REALITY_JUDGE_WEIGHT * judgeScore +
      REALITY_HEURISTIC_WEIGHT * heuristicScore,
  );
}

function turnKey({
  scenarioId,
  modelId,
  turnIndex,
}: Pick<RealityBenchmarkTurnResult, "scenarioId" | "modelId" | "turnIndex">) {
  return `${modelId}:${scenarioId}:${turnIndex}`;
}

function buildTranscriptForResult(
  results: RealityBenchmarkTurnResult[],
  target: RealityBenchmarkTurnResult,
): RealityTranscriptMessage[] {
  return results
    .filter(
      (result) =>
        result.modelId === target.modelId &&
        result.scenarioId === target.scenarioId &&
        result.turnIndex < target.turnIndex,
    )
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .flatMap((result) => [
      { role: "user" as const, content: result.userMessage },
      { role: "assistant" as const, content: result.assistantText },
    ]);
}

function summarizeJudgeTurnForResult(
  result: RealityJudgeTurnResult,
  heuristicScore: number,
): RealityJudgeTurnScore {
  const scores = result.judges.map((judge) => clampJudgeScore(judge.score));
  const consensusScore = average(scores);
  const disagreement =
    scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0;

  return {
    judges: result.judges,
    consensusScore,
    disagreement,
    flaggedForReview: disagreement > REALITY_JUDGE_DISAGREEMENT_THRESHOLD,
    blendedScore: blendRealityScores(consensusScore, heuristicScore),
  };
}

function assertAnchors(
  turn: RealityScenarioTurn,
  scenarioId: string,
  turnIndex: number,
) {
  if (!turn.lowAnchorResponse || !turn.highAnchorResponse) {
    throw new Error(
      `Reality judge requires low/high anchors for ${scenarioId}#${turnIndex}.`,
    );
  }
}

function clampJudgeScore(value: number) {
  return Math.min(10, Math.max(0, Number.isFinite(value) ? value : 0));
}

function average(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return 0;
  return roundScore(
    finiteValues.reduce((total, value) => total + value, 0) /
      finiteValues.length,
  );
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}
