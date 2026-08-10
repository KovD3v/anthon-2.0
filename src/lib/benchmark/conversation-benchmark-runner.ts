import {
  assertCompatibleConversationRuns,
  CONVERSATION_ARTIFACT_VERSION,
  CONVERSATION_MODEL_ID,
  CONVERSATION_SCENARIO_VERSION,
  type ConversationalDimensions,
  type ConversationComparisonArtifact,
  type ConversationComparisonPair,
  type ConversationRunArtifact,
  conversationReplicaKey,
  diagnoseConversationStructure,
} from "./conversation-benchmark";
import {
  assignBlindVariants,
  type ConversationJudgeResult,
  dimensionsForVariant,
  revealVerdict,
} from "./conversation-benchmark-judge";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";
import {
  type DatabaseBackedRealityExecutor,
  type RealityTranscriptMessage,
  runRealityBenchmark,
} from "./reality";
import { serializeRealityBenchmarkSummary } from "./reality-cli";

export async function runConversationVariant({
  variant,
  label,
  commit,
  samples,
  configurationFingerprint,
  executorFactory,
}: {
  variant: "baseline" | "candidate";
  label: string;
  commit: string;
  samples: number;
  configurationFingerprint: string;
  executorFactory: (replicaId: string) => DatabaseBackedRealityExecutor;
}): Promise<ConversationRunArtifact> {
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error("samples must be a positive integer");
  }
  const summaries: ConversationRunArtifact["summaries"] = [];
  const replicas: ConversationRunArtifact["replicas"] = [];
  for (let index = 1; index <= samples; index += 1) {
    const replicaId = `sample-${index}`;
    const benchmark = executorFactory(replicaId);
    try {
      const summary = await runRealityBenchmark({
        models: [CONVERSATION_MODEL_ID],
        scenarios: CONVERSATIONAL_REALITY_SCENARIOS,
        executor: benchmark.executor,
      });
      for (const result of summary.results) {
        if (
          !result.assistantText.trim() ||
          result.metadata?.benchmarkError === true ||
          result.metrics.generationTimeMs <= 0
        ) {
          throw new Error(
            `incomplete conversation result ${result.scenarioId}#${result.turnIndex}`,
          );
        }
        replicas.push({
          replicaId,
          scenarioId: result.scenarioId,
          turnIndex: result.turnIndex,
          assistantText: result.assistantText,
          diagnostics: diagnoseConversationStructure(result.assistantText),
          metrics: {
            costUsd: result.metrics.costUsd,
            generationTimeMs: result.metrics.generationTimeMs,
            inputTokens: result.metrics.inputTokens,
            outputTokens: result.metrics.outputTokens,
          },
          guardrails: {
            safety: result.score.dimensions.safety,
            concision: result.score.dimensions.concision,
            coachingUsefulness: result.score.dimensions.coachingUsefulness,
          },
        });
      }
      summaries.push(
        sanitizeRealitySummary(
          serializeRealityBenchmarkSummary(summary),
        ) as ReturnType<typeof serializeRealityBenchmarkSummary>,
      );
    } finally {
      await benchmark.cleanup();
    }
  }
  return {
    artifactVersion: CONVERSATION_ARTIFACT_VERSION,
    scenarioVersion: CONVERSATION_SCENARIO_VERSION,
    variant,
    label,
    commit,
    createdAt: new Date().toISOString(),
    modelId: CONVERSATION_MODEL_ID,
    samples,
    scenarioIds: CONVERSATIONAL_REALITY_SCENARIOS.map(
      (scenario) => scenario.id,
    ).sort(),
    configurationFingerprint,
    summaries,
    replicas,
  };
}

function sanitizeRealitySummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRealitySummary);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !["authorization", "cookie", "systemPrompt", "tracePayload"].includes(
            key,
          ),
      )
      .map(([key, child]) => [key, sanitizeRealitySummary(child)]),
  );
}

type PairJudge = (input: {
  scenarioId: string;
  turnIndex: number;
  replicaId: string;
  answerA: string;
  answerB: string;
  transcriptA: RealityTranscriptMessage[];
  transcriptB: RealityTranscriptMessage[];
}) => Promise<ConversationJudgeResult>;

export async function buildConversationComparison({
  baseline,
  candidate,
  judges,
}: {
  baseline: ConversationRunArtifact;
  candidate: ConversationRunArtifact;
  judges: [PairJudge, PairJudge];
}): Promise<ConversationComparisonArtifact> {
  assertCompatibleConversationRuns(baseline, candidate);
  const candidateByKey = new Map(
    candidate.replicas.map((replica) => [
      conversationReplicaKey(replica),
      replica,
    ]),
  );
  const baselineByKey = new Map(
    baseline.replicas.map((replica) => [
      conversationReplicaKey(replica),
      replica,
    ]),
  );
  const pairs: ConversationComparisonPair[] = [];
  let totalJudgeCostUsd = 0;
  for (const base of baseline.replicas) {
    const key = conversationReplicaKey(base);
    const next = candidateByKey.get(key);
    if (!next) throw new Error(`Missing candidate pair ${key}`);
    const assignment = assignBlindVariants(
      base.scenarioId,
      base.turnIndex,
      base.replicaId,
    );
    const answerA =
      assignment.A === "baseline" ? base.assistantText : next.assistantText;
    const answerB =
      assignment.B === "baseline" ? base.assistantText : next.assistantText;
    const transcriptFor = (
      variant: "baseline" | "candidate",
    ): RealityTranscriptMessage[] => {
      const scenario = CONVERSATIONAL_REALITY_SCENARIOS.find(
        (item) => item.id === base.scenarioId,
      );
      if (!scenario) throw new Error(`Unknown scenario ${base.scenarioId}`);
      const replicas = variant === "baseline" ? baselineByKey : candidateByKey;
      return scenario.turns
        .slice(0, base.turnIndex)
        .flatMap((turn, turnIndex) => {
          const previous = replicas.get(
            `${base.scenarioId}:${turnIndex}:${base.replicaId}`,
          );
          if (!previous) throw new Error(`Missing prior ${variant} turn`);
          return [
            { role: "user" as const, content: turn.userMessage },
            { role: "assistant" as const, content: previous.assistantText },
          ];
        });
    };
    const transcriptA = transcriptFor(assignment.A);
    const transcriptB = transcriptFor(assignment.B);
    const results = await Promise.all(
      judges.map((judge) =>
        judge({
          scenarioId: base.scenarioId,
          turnIndex: base.turnIndex,
          replicaId: base.replicaId,
          answerA,
          answerB,
          transcriptA,
          transcriptB,
        }),
      ),
    );
    totalJudgeCostUsd += results.reduce(
      (sum, result) => sum + result.costUsd,
      0,
    );
    const verdicts = results.map((result) =>
      revealVerdict(result.output.preferred, assignment),
    );
    pairs.push({
      key,
      scenarioId: base.scenarioId,
      turnIndex: base.turnIndex,
      replicaId: base.replicaId,
      baselineText: base.assistantText,
      candidateText: next.assistantText,
      verdicts,
      dimensionsBaseline: averageDimensions(
        results.map((result) =>
          dimensionsForVariant(result.output, assignment, "baseline"),
        ),
      ),
      dimensionsCandidate: averageDimensions(
        results.map((result) =>
          dimensionsForVariant(result.output, assignment, "candidate"),
        ),
      ),
      reasons: results.map((result) => result.output.reason),
      disagreement:
        verdicts.includes("baseline") && verdicts.includes("candidate"),
      safetyRegression: results.some(
        (result) => result.output.safetyRegression !== "neither",
      ),
    });
  }
  const allVerdicts = pairs.flatMap((pair) => pair.verdicts);
  return {
    artifactVersion: CONVERSATION_ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    baselineLabel: baseline.label,
    candidateLabel: candidate.label,
    baselineCommit: baseline.commit,
    candidateCommit: candidate.commit,
    modelId: CONVERSATION_MODEL_ID,
    scenarioVersion: CONVERSATION_SCENARIO_VERSION,
    samples: baseline.samples,
    verdictCounts: {
      baseline: allVerdicts.filter((value) => value === "baseline").length,
      candidate: allVerdicts.filter((value) => value === "candidate").length,
      tie: allVerdicts.filter((value) => value === "tie").length,
      both_insufficient: allVerdicts.filter(
        (value) => value === "both_insufficient",
      ).length,
    },
    dimensionsBaseline: averageDimensions(
      pairs.map((pair) => pair.dimensionsBaseline),
    ),
    dimensionsCandidate: averageDimensions(
      pairs.map((pair) => pair.dimensionsCandidate),
    ),
    guardrailDeltas: {
      safety:
        average(candidate.replicas.map((r) => r.guardrails.safety)) -
        average(baseline.replicas.map((r) => r.guardrails.safety)),
      concisionPercent: percentDelta(
        average(baseline.replicas.map((r) => r.guardrails.concision)),
        average(candidate.replicas.map((r) => r.guardrails.concision)),
      ),
      coachingUsefulness:
        average(
          candidate.replicas.map((r) => r.guardrails.coachingUsefulness),
        ) -
        average(baseline.replicas.map((r) => r.guardrails.coachingUsefulness)),
      latencyPercent: percentDelta(
        average(baseline.replicas.map((r) => r.metrics.generationTimeMs)),
        average(candidate.replicas.map((r) => r.metrics.generationTimeMs)),
      ),
      costPercent: percentDelta(
        average(baseline.replicas.map((r) => r.metrics.costUsd)),
        average(candidate.replicas.map((r) => r.metrics.costUsd)),
      ),
    },
    structuralBaseline: averageStructure(
      baseline.replicas.map((r) => r.diagnostics),
    ),
    structuralCandidate: averageStructure(
      candidate.replicas.map((r) => r.diagnostics),
    ),
    totalJudgeCostUsd,
    pairs,
  };
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function percentDelta(before: number, after: number) {
  return before === 0
    ? after === 0
      ? 0
      : 100
    : ((after - before) / before) * 100;
}

function averageDimensions(
  values: ConversationalDimensions[],
): ConversationalDimensions {
  return {
    contextUse: average(values.map((v) => v.contextUse)),
    conversationalNaturalness: average(
      values.map((v) => v.conversationalNaturalness),
    ),
    discoveryBeforeAdvice: average(values.map((v) => v.discoveryBeforeAdvice)),
    multiTurnProgression: average(values.map((v) => v.multiTurnProgression)),
    questionQuality: average(values.map((v) => v.questionQuality)),
  };
}

function averageStructure(
  values: ConversationRunArtifact["replicas"][number]["diagnostics"][],
) {
  return {
    acknowledgmentListQuestion:
      average(values.map((v) => Number(v.acknowledgmentListQuestion))) >= 0.5,
    endsWithQuestion:
      average(values.map((v) => Number(v.endsWithQuestion))) >= 0.5,
    formulaicOpening:
      average(values.map((v) => Number(v.formulaicOpening))) >= 0.5,
    hasMarkdownList:
      average(values.map((v) => Number(v.hasMarkdownList))) >= 0.5,
    hasQuestion: average(values.map((v) => Number(v.hasQuestion))) >= 0.5,
    phraseHits: Array.from(new Set(values.flatMap((v) => v.phraseHits))).sort(),
    wordCount: average(values.map((v) => v.wordCount)),
  };
}
