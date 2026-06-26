import { generateText, Output } from "ai";
import { z } from "zod";
import { extractAIMetrics } from "@/lib/ai/cost-calculator";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
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
const REALITY_JUDGE_TIMEOUT_MS = 120_000;
const REALITY_JUDGE_MAX_ATTEMPTS = 2;

const RealityJudgeOutputSchema = z.object({
  score: z.number(),
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
  judgeConcurrency = 1,
  judgeTurnExecutor = judgeRealityTurn,
  onProgress,
}: {
  summary: RealityBenchmarkSummary;
  scenarios: RealityScenario[];
  judgeModels?: string[];
  judgeConcurrency?: number;
  judgeTurnExecutor?: typeof judgeRealityTurn;
  onProgress?: (progress: {
    completed: number;
    total: number;
    result: RealityBenchmarkTurnResult;
  }) => void;
}) {
  assertTwoJudgeModels(judgeModels);

  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const judgeByTurn = new Map<
    string,
    { result: RealityBenchmarkTurnResult; judges: RealityJudgeModelScore[] }
  >();
  const judgeJobs: Array<{
    result: RealityBenchmarkTurnResult;
    judgeModelId: string;
    scenario: RealityScenario;
    turn: RealityScenarioTurn;
    transcript: RealityTranscriptMessage[];
  }> = [];
  const total = summary.results.length;

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
    judgeByTurn.set(turnKey(result), {
      result,
      judges: [],
    });
    for (const judgeModelId of judgeModels) {
      judgeJobs.push({
        result,
        judgeModelId,
        scenario,
        turn,
        transcript,
      });
    }
  }

  let nextJobIndex = 0;
  let completedTurns = 0;
  const workerCount = Math.min(Math.max(1, judgeConcurrency), judgeJobs.length);
  const judgeModelOrder = new Map(
    judgeModels.map((judgeModelId, index) => [judgeModelId, index]),
  );

  async function runWorker() {
    while (true) {
      const jobIndex = nextJobIndex;
      nextJobIndex += 1;
      const job = judgeJobs[jobIndex];
      if (!job) {
        return;
      }

      const judge = await judgeTurnExecutor({
        judgeModelId: job.judgeModelId,
        scenario: job.scenario,
        turn: job.turn,
        turnIndex: job.result.turnIndex,
        transcript: job.transcript,
        candidateAnswer: job.result.assistantText,
      });
      const turnJudges = judgeByTurn.get(turnKey(job.result));
      if (!turnJudges) {
        throw new Error(
          `Missing judge result bucket for ${turnKey(job.result)}`,
        );
      }

      turnJudges.judges.push(judge);
      if (turnJudges.judges.length === judgeModels.length) {
        turnJudges.judges.sort(
          (a, b) =>
            (judgeModelOrder.get(a.judgeModelId) ?? 0) -
            (judgeModelOrder.get(b.judgeModelId) ?? 0),
        );
        completedTurns += 1;
        onProgress?.({
          completed: completedTurns,
          total,
          result: turnJudges.result,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const judgeResults = summary.results.map((result) => {
    const turnJudges = judgeByTurn.get(turnKey(result));
    if (!turnJudges || turnJudges.judges.length !== judgeModels.length) {
      throw new Error(`Incomplete judge scores for ${turnKey(result)}`);
    }

    return {
      scenarioId: result.scenarioId,
      modelId: result.modelId,
      turnIndex: result.turnIndex,
      judges: turnJudges.judges,
    };
  });

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
  const prompt = buildRealityJudgePrompt({
    scenario,
    turn,
    turnIndex,
    transcript,
    candidateAnswer,
  });

  const judgeStartTime = Date.now();
  const judgeResult = await retryJudgeCall(async () => {
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      REALITY_JUDGE_TIMEOUT_MS,
    );

    try {
      return await generateText({
        model: openrouter(judgeModelId),
        output: Output.object({ schema: RealityJudgeOutputSchema }),
        system:
          "Sei un giudice severo e calibrato di risposte AI per coaching sportivo. Valuti solo la risposta candidata rispetto agli anchor e al contesto.",
        prompt,
        temperature: 0,
        abortSignal: abortController.signal,
        providerOptions: {
          openrouter: getOpenRouterProviderOptionsForModel(judgeModelId),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }, judgeModelId);
  const { output } = judgeResult;
  const metrics = extractAIMetrics(judgeModelId, judgeStartTime, {
    text: "",
    usage: judgeResult.usage,
    providerMetadata: judgeResult.providerMetadata as
      | Record<string, unknown>
      | undefined,
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
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    costUsd: metrics.costUsd,
    generationTimeMs: metrics.generationTimeMs,
  };
}

async function retryJudgeCall<T>(
  call: () => Promise<T>,
  judgeModelId: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= REALITY_JUDGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (attempt === REALITY_JUDGE_MAX_ATTEMPTS) {
        break;
      }
    }
  }

  throw new Error(
    `Reality judge ${judgeModelId} failed after ${REALITY_JUDGE_MAX_ATTEMPTS} attempts: ${formatJudgeError(
      lastError,
    )}`,
  );
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
    const judgeCosts = judgedResults.flatMap((result) =>
      (result.judge?.judges ?? []).map((judge) => judge.costUsd ?? 0),
    );
    const totalJudgeCostUsd = sum(judgeCosts);

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
      avgJudgeCostUsd: average(judgeCosts),
      totalJudgeCostUsd,
      totalRunCostUsd: model.totalCostUsd + totalJudgeCostUsd,
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

export function refreshExistingRealityJudgeScores(
  summary: RealityBenchmarkSummary,
): RealityBenchmarkSummary {
  const results = summary.results.map((result) => ({
    ...result,
    ...(result.judge
      ? {
          judge: summarizeJudgeTurnForResult(
            {
              scenarioId: result.scenarioId,
              modelId: result.modelId,
              turnIndex: result.turnIndex,
              judges: result.judge.judges,
            },
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
    const judgeCosts = judgedResults.flatMap((result) =>
      (result.judge?.judges ?? []).map((judge) => judge.costUsd ?? 0),
    );
    const totalJudgeCostUsd = sum(judgeCosts);

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
      avgJudgeCostUsd: average(judgeCosts),
      totalJudgeCostUsd,
      totalRunCostUsd: model.totalCostUsd + totalJudgeCostUsd,
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

function sum(values: number[]) {
  return values
    .filter(Number.isFinite)
    .reduce((total, value) => total + value, 0);
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function formatJudgeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
