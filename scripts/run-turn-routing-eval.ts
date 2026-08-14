import { normalizeCapabilityDecision } from "@/lib/ai/capability-arbitration";
import {
  hasUntrustedSuppliedTextInstructions,
  normalizeExecutionDecision,
  resolveDeterministicTaskKind,
  TURN_CLASSIFIER_VERSION,
} from "@/lib/ai/execution-routing";
import { resolveDeterministicTurnClassification } from "@/lib/ai/fast-routing";
import { normalizeClassifierProposalForArbitration } from "@/lib/ai/turn-arbitration";
import {
  CAPABILITY_CLASSIFIER_MIN_CONFIDENCE,
  type CapabilityClassifierProposal,
  classifyTurn,
  resolveTurnClassifierModelId,
} from "@/lib/ai/turn-classification";
import {
  scoreTurnRouting,
  shouldFailTurnRoutingEvaluation,
  TURN_ROUTING_EXTENDED_FIXTURES,
  TURN_ROUTING_FIXTURES,
  type TurnRoutingFixture,
  type TurnRoutingResult,
} from "@/lib/benchmark/turn-routing";

const CLASSIFIER_MODEL_ID = resolveTurnClassifierModelId();
const EVALUATION_MODE =
  process.env.TURN_ROUTING_EVAL_MODE === "fast" ||
  process.env.TURN_ROUTING_EVAL_MODE === "nonblocking"
    ? process.env.TURN_ROUTING_EVAL_MODE
    : "baseline";
const EVALUATION_SUITE =
  process.env.TURN_ROUTING_EVAL_SUITE === "extended"
    ? ([...TURN_ROUTING_FIXTURES, ...TURN_ROUTING_EXTENDED_FIXTURES] as const)
    : TURN_ROUTING_FIXTURES;
const CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.TURN_ROUTING_EVAL_CONCURRENCY ?? "2", 10) || 2,
);
const REPEATS = Math.max(
  1,
  Number.parseInt(process.env.TURN_ROUTING_EVAL_REPEATS ?? "1", 10) || 1,
);
const VERBOSE = process.env.TURN_ROUTING_EVAL_VERBOSE === "1";

type EvaluationMode = "baseline" | "fast" | "nonblocking";

function fixtureNormalization(fixture: TurnRoutingFixture) {
  const normalization = fixture.normalization;
  return {
    explicitWebRule: normalization?.explicitWebRule ?? "allowed",
    hasDeterministicCoachingIntent:
      normalization?.hasDeterministicCoachingIntent ?? false,
    requiresExternalKnowledge:
      normalization?.requiresExternalKnowledge ?? false,
    inputOrigin: normalization?.inputOrigin ?? "text",
    responseMode: normalization?.responseMode ?? "text",
    hasPendingApproval: normalization?.hasPendingApproval ?? false,
    estimatedInputTokens: normalization?.estimatedInputTokens ?? 32,
    requestedOutputTokens: normalization?.requestedOutputTokens ?? 160,
  } as const;
}

function deterministicClassificationForFixture(
  fixture: TurnRoutingFixture,
  fallbackToStandard: boolean,
) {
  const normalization = fixtureNormalization(fixture);
  return resolveDeterministicTurnClassification(
    {
      userMessage: fixture.userMessage,
      explicitWebRule: normalization.explicitWebRule,
      requireClassifierRoutineProposal: true,
      hasPendingMemoryApproval: normalization.hasPendingApproval,
      hasDeterministicCoachingIntent:
        normalization.hasDeterministicCoachingIntent,
      requiresExternalKnowledge: normalization.requiresExternalKnowledge,
      inputOrigin: normalization.inputOrigin,
      responseMode: normalization.responseMode,
      estimatedInputTokens: normalization.estimatedInputTokens,
      requestedOutputTokens: normalization.requestedOutputTokens,
      hasRecentContext: fixture.context.trim().length > 0,
    },
    {
      fallbackToStandard,
    },
  );
}

function capabilityClassifier(
  proposal: CapabilityClassifierProposal | null,
  confidence: number,
) {
  if (!proposal || confidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(proposal).flatMap(([capability, value]) =>
      value === "yes" ? [[capability, true]] : [],
    ),
  );
}

async function evaluateFixture(
  fixture: TurnRoutingFixture,
  mode: EvaluationMode,
): Promise<TurnRoutingResult> {
  const deterministicClassification =
    mode === "fast" || mode === "nonblocking"
      ? deterministicClassificationForFixture(fixture, mode === "nonblocking")
      : null;
  const classification =
    deterministicClassification ??
    (await classifyTurn({
      userMessage: fixture.userMessage,
      context: fixture.context,
      modelId: CLASSIFIER_MODEL_ID,
    }));
  const normalization = fixture.normalization;
  const proposal = normalizeClassifierProposalForArbitration(
    classification.proposal,
  );
  const responseMode = normalization?.responseMode ?? "text";
  const capabilities = normalizeCapabilityDecision({
    userMessage: fixture.userMessage,
    isGuest: false,
    memoryEnabled: true,
    voiceAllowed: true,
    responseMode,
    explicitWebRule: normalization?.explicitWebRule ?? "allowed",
    allowConcurrentRoutineAndWeb: true,
    requireClassifierRoutineProposal: true,
    hasPendingMemoryApproval: normalization?.hasPendingApproval,
    resolvedMemoryTarget: normalization?.resolvedMemoryTarget,
    classifier: capabilityClassifier(
      proposal?.capabilities ?? null,
      proposal?.capabilityConfidence ?? 0,
    ),
  });
  const execution = normalizeExecutionDecision({
    plannerMode: "agentic",
    classifierOutcome: classification.outcome,
    classificationSource: classification.classificationSource,
    classifierVersion: TURN_CLASSIFIER_VERSION,
    capabilityProposal: proposal?.capabilities ?? null,
    capabilityConfidence: proposal?.capabilityConfidence ?? 0,
    workload: proposal?.workload ?? null,
    capabilities,
    hasDeterministicCoachingIntent:
      normalization?.hasDeterministicCoachingIntent ?? false,
    requiresExternalKnowledge:
      normalization?.requiresExternalKnowledge ?? false,
    inputOrigin: normalization?.inputOrigin ?? "text",
    hasPendingApproval: normalization?.hasPendingApproval ?? false,
    responseMode,
    estimatedInputTokens: normalization?.estimatedInputTokens ?? 32,
    requestedOutputTokens: normalization?.requestedOutputTokens ?? 160,
    hasRecentContext: fixture.context.trim().length > 0,
    hasUntrustedSuppliedText: hasUntrustedSuppliedTextInstructions(
      fixture.userMessage,
    ),
    deterministicTaskKind: resolveDeterministicTaskKind(fixture.userMessage),
  });

  return {
    fixture,
    outcome: classification.outcome,
    actualProfile: execution.eligibleProfile,
    actualTaskKind: execution.taskKind,
    classificationLatencyMs: classification.latencyMs,
    classificationSource: classification.classificationSource ?? "classifier",
  };
}

async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  limit: number,
  run: (value: T) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await run(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return results;
}

function compactResult(result: TurnRoutingResult) {
  return {
    id: result.fixture.id,
    language: result.fixture.language,
    protectedStandard: result.fixture.protectedStandard,
    expectedProfile: result.fixture.expectedProfile,
    actualProfile: result.actualProfile,
    expectedTaskKind: result.fixture.expectedTaskKind,
    actualTaskKind: result.actualTaskKind,
    outcome: result.outcome,
    classificationLatencyMs: result.classificationLatencyMs,
    classificationSource: result.classificationSource,
  };
}

function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  ];
}

function summarizeLatency(results: readonly TurnRoutingResult[]) {
  const latencies = results.map(
    (result) => result.classificationLatencyMs ?? 0,
  );
  const remoteLatencies = results
    .filter((result) => result.classificationSource === "classifier")
    .map((result) => result.classificationLatencyMs ?? 0);
  const deterministic = results.filter(
    (result) => result.classificationSource === "rule",
  ).length;

  return {
    n: latencies.length,
    deterministic,
    deterministicPercent: latencies.length
      ? Math.round((deterministic / latencies.length) * 1000) / 10
      : 0,
    remote: remoteLatencies.length,
    meanMs: latencies.length
      ? Math.round(
          latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
        )
      : 0,
    p50Ms: percentile(latencies, 0.5),
    p90Ms: percentile(latencies, 0.9),
    p95Ms: percentile(latencies, 0.95),
    maxMs: latencies.length ? Math.max(...latencies) : 0,
    remoteP50Ms: percentile(remoteLatencies, 0.5),
    remoteP90Ms: percentile(remoteLatencies, 0.9),
  };
}

function allowlistCandidates(results: readonly TurnRoutingResult[]) {
  const candidates = new Map<
    string,
    { id: string; taskKind: string; language: string }
  >();

  for (const result of results) {
    if (
      result.classificationSource === "classifier" &&
      result.fixture.expectedProfile === "light" &&
      result.actualProfile === "light"
    ) {
      candidates.set(result.fixture.id, {
        id: result.fixture.id,
        taskKind: result.actualTaskKind,
        language: result.fixture.language,
      });
    }
  }

  return [...candidates.values()];
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for eval:turn-routing");
  }

  const repeatedResults: TurnRoutingResult[][] = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    repeatedResults.push(
      await mapWithConcurrency(EVALUATION_SUITE, CONCURRENCY, (fixture) =>
        evaluateFixture(fixture, EVALUATION_MODE),
      ),
    );
  }
  const results = repeatedResults.flat();
  const score = scoreTurnRouting(results);
  const successfulClassifications = results.filter(
    ({ outcome }) => outcome === "accepted" || outcome === "low_confidence",
  ).length;
  const invalidResponses = results.filter(
    ({ outcome }) => outcome === "invalid",
  ).length;
  const failedResponses = results.filter(
    ({ outcome }) => outcome === "failed",
  ).length;
  const runScores = repeatedResults.map((run) => scoreTurnRouting(run));
  const runFailures = repeatedResults.filter((run) =>
    shouldFailTurnRoutingEvaluation(run),
  ).length;
  const mismatches = results
    .filter(
      (result) =>
        result.actualProfile !== result.fixture.expectedProfile ||
        result.actualTaskKind !== result.fixture.expectedTaskKind,
    )
    .map(compactResult);
  const output = {
    model: CLASSIFIER_MODEL_ID,
    mode: EVALUATION_MODE,
    suite:
      process.env.TURN_ROUTING_EVAL_SUITE === "extended" ? "extended" : "base",
    repeats: REPEATS,
    concurrency: CONCURRENCY,
    fixturesPerRun: EVALUATION_SUITE.length,
    successfulClassifications,
    invalidResponses,
    failedResponses,
    score,
    runScores,
    runFailures,
    latency: summarizeLatency(results),
    allowlistCandidates: allowlistCandidates(results),
    mismatches,
    ...(VERBOSE ? { results: results.map(compactResult) } : {}),
  };

  console.log(JSON.stringify(output, null, 2));
  console.log(
    [
      "",
      "## Turn routing evaluation",
      "",
      `- Model: \`${CLASSIFIER_MODEL_ID}\``,
      `- Mode: \`${EVALUATION_MODE}\`; suite: \`${output.suite}\`; repeats: ${REPEATS}`,
      `- Classifications: ${successfulClassifications}/${results.length}`,
      `- Correct: ${score.correct}/${score.total}; task kind: ${score.taskKindCorrect}/${score.total}`,
      `- False light: ${score.falseLight} (protected: ${score.protectedFalseLight}); false standard: ${score.falseStandard}`,
      `- Invalid responses: ${invalidResponses}`,
      `- Failed responses: ${failedResponses}`,
      `- Latency: p50 ${output.latency.p50Ms} ms; p90 ${output.latency.p90Ms} ms; p95 ${output.latency.p95Ms} ms; deterministic ${output.latency.deterministicPercent}%`,
      `- Allowlist candidates still handled by LLM: ${output.allowlistCandidates.length}`,
    ].join("\n"),
  );

  if (runFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
