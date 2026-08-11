import {
  type CapabilityArbitrationInput,
  type CapabilityDecision,
  normalizeCapabilityDecision,
} from "./capability-arbitration";
import {
  freezeTurnDecision,
  normalizeExecutionDecision,
  TURN_CLASSIFIER_VERSION,
  type TurnDecision,
} from "./execution-routing";
import {
  CAPABILITY_CLASSIFIER_MIN_CONFIDENCE,
  type CapabilityClassifierProposal,
  classifyTurn,
  type TurnClassificationResult,
} from "./turn-classification";

export type TurnArbitrationInput = Omit<
  CapabilityArbitrationInput,
  "classifier"
> & {
  userId?: string;
  classifierContext: string;
  classifierModelId: string;
  plannerMode: "legacy" | "agentic";
  hasDeterministicCoachingIntent: boolean;
  requiresExternalKnowledge: boolean;
  inputOrigin: "text" | "direct_media";
  hasPendingApproval: boolean;
  estimatedInputTokens: number;
  requestedOutputTokens: number;
  abortSignal?: AbortSignal;
};

export type TurnArbitrationResult = {
  decision: TurnDecision;
  classificationLatencyMs: number;
};

function toCapabilityClassifierAdapter(
  proposal: CapabilityClassifierProposal | null,
  capabilityConfidence: number,
): Partial<CapabilityDecision> | null {
  if (
    !proposal ||
    capabilityConfidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE
  ) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(proposal).flatMap(([capability, value]) =>
      value === "yes" ? [[capability, true]] : [],
    ),
  ) as Partial<CapabilityDecision>;
}

function legacyClassification(): TurnClassificationResult {
  return {
    proposal: null,
    outcome: "accepted",
    latencyMs: 0,
  };
}

export async function arbitrateTurn(
  input: TurnArbitrationInput,
): Promise<TurnArbitrationResult> {
  let classification: TurnClassificationResult;
  try {
    classification =
      input.plannerMode === "agentic"
        ? await classifyTurn({
            userId: input.userId,
            userMessage: input.userMessage,
            context: input.classifierContext,
            modelId: input.classifierModelId,
            abortSignal: input.abortSignal,
          })
        : legacyClassification();
    input.abortSignal?.throwIfAborted();
  } catch (error) {
    input.abortSignal?.throwIfAborted();
    throw error;
  }

  const proposal = classification.proposal;
  const capabilities = normalizeCapabilityDecision({
    userMessage: input.userMessage,
    isGuest: input.isGuest,
    memoryEnabled: input.memoryEnabled,
    voiceAllowed: input.voiceAllowed,
    responseMode: input.responseMode,
    explicitWebRule: input.explicitWebRule,
    allowConcurrentRoutineAndWeb: input.allowConcurrentRoutineAndWeb,
    requireClassifierRoutineProposal: input.requireClassifierRoutineProposal,
    hasPendingMemoryApproval: input.hasPendingMemoryApproval,
    resolvedMemoryTarget: input.resolvedMemoryTarget,
    classifier: toCapabilityClassifierAdapter(
      proposal?.capabilities ?? null,
      proposal?.capabilityConfidence ?? 0,
    ),
  });
  const execution = normalizeExecutionDecision({
    plannerMode: input.plannerMode,
    classifierOutcome: classification.outcome,
    classifierVersion: TURN_CLASSIFIER_VERSION,
    capabilityProposal: proposal?.capabilities ?? null,
    capabilityConfidence: proposal?.capabilityConfidence ?? 0,
    workload: proposal?.workload ?? null,
    capabilities,
    hasDeterministicCoachingIntent: input.hasDeterministicCoachingIntent,
    requiresExternalKnowledge: input.requiresExternalKnowledge,
    inputOrigin: input.inputOrigin,
    hasPendingApproval: input.hasPendingApproval,
    responseMode: input.responseMode,
    estimatedInputTokens: input.estimatedInputTokens,
    requestedOutputTokens: input.requestedOutputTokens,
  });
  input.abortSignal?.throwIfAborted();

  return {
    decision: freezeTurnDecision({
      version: 1,
      capabilities,
      execution,
    }),
    classificationLatencyMs: classification.latencyMs,
  };
}
