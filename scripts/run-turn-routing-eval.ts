import { normalizeCapabilityDecision } from "@/lib/ai/capability-arbitration";
import {
  normalizeExecutionDecision,
  TURN_CLASSIFIER_VERSION,
} from "@/lib/ai/execution-routing";
import {
  CAPABILITY_CLASSIFIER_MIN_CONFIDENCE,
  type CapabilityClassifierProposal,
  classifyTurn,
} from "@/lib/ai/turn-classification";
import {
  scoreTurnRouting,
  TURN_ROUTING_FIXTURES,
  type TurnRoutingFixture,
  type TurnRoutingResult,
} from "@/lib/benchmark/turn-routing";

const CLASSIFIER_MODEL_ID =
  process.env.PROMPT_MODULE_CLASSIFIER_MODEL_ID || "qwen/qwen3.6-27b";
const CONCURRENCY = 2;

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
): Promise<TurnRoutingResult> {
  const classification = await classifyTurn({
    userMessage: fixture.userMessage,
    context: fixture.context,
    modelId: CLASSIFIER_MODEL_ID,
  });
  const normalization = fixture.normalization;
  const proposal = classification.proposal;
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
  });

  return {
    fixture,
    outcome: classification.outcome,
    actualProfile: execution.eligibleProfile,
    actualTaskKind: execution.taskKind,
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
  };
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for eval:turn-routing");
  }

  const results = await mapWithConcurrency(
    TURN_ROUTING_FIXTURES,
    CONCURRENCY,
    evaluateFixture,
  );
  const score = scoreTurnRouting(results);
  const successfulClassifications = results.filter(
    ({ outcome }) => outcome === "accepted" || outcome === "low_confidence",
  ).length;
  const invalidResponses = results.filter(
    ({ outcome }) => outcome === "invalid",
  ).length;
  const output = {
    model: CLASSIFIER_MODEL_ID,
    concurrency: CONCURRENCY,
    successfulClassifications,
    invalidResponses,
    score,
    results: results.map(compactResult),
  };

  console.log(JSON.stringify(output, null, 2));
  console.log(
    [
      "",
      "## Turn routing evaluation",
      "",
      `- Model: \`${CLASSIFIER_MODEL_ID}\``,
      `- Classifications: ${successfulClassifications}/${TURN_ROUTING_FIXTURES.length}`,
      `- Correct: ${score.correct}/${score.total}; task kind: ${score.taskKindCorrect}/${score.total}`,
      `- False light: ${score.falseLight} (protected: ${score.protectedFalseLight}); false standard: ${score.falseStandard}`,
      `- Invalid responses: ${invalidResponses}`,
    ].join("\n"),
  );

  if (
    score.protectedFalseLight > 0 ||
    successfulClassifications === 0 ||
    invalidResponses > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
