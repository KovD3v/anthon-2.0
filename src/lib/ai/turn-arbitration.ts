import {
  type CapabilityArbitrationInput,
  type CapabilityDecision,
  normalizeCapabilityDecision,
} from "./capability-arbitration";
import {
  freezeTurnDecision,
  hasUntrustedSuppliedTextInstructions,
  normalizeExecutionDecision,
  resolveDeterministicTaskKind,
  TURN_CLASSIFIER_VERSION,
  type TurnDecision,
} from "./execution-routing";
import { resolveDeterministicTurnClassification } from "./fast-routing";
import {
  CAPABILITY_CLASSIFIER_MIN_CONFIDENCE,
  type CapabilityClassifierProposal,
  classifyTurn,
  type TurnClassificationResult,
  type TurnClassifierProposal,
} from "./turn-classification";

const SELF_CONTAINED_TRANSFORM_TASKS = new Set([
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
]);

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
  hasRecentContext: boolean;
  measureClassifierCall?: (
    operation: () => Promise<TurnClassificationResult>,
  ) => Promise<TurnClassificationResult>;
  abortSignal?: AbortSignal;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type TurnArbitrationResult = {
  decision: TurnDecision;
  classificationLatencyMs: number;
  classifierModel?: string;
  classifierProvider?: string;
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

export function normalizeClassifierProposalForArbitration(
  proposal: TurnClassifierProposal | null,
): TurnClassifierProposal | null {
  if (
    !proposal ||
    !SELF_CONTAINED_TRANSFORM_TASKS.has(proposal.workload.taskKind) ||
    proposal.workload.contextDependency !== "none" ||
    proposal.workload.knowledgeNeed !== "supplied_only" ||
    proposal.workload.reasoningDepth !== "minimal" ||
    proposal.workload.sensitivity !== "ordinary"
  ) {
    return proposal;
  }

  if (
    proposal.capabilities.rag === "no" &&
    proposal.capabilities.memoryWrite === "no"
  ) {
    return proposal;
  }

  return {
    ...proposal,
    capabilities: {
      ...proposal.capabilities,
      rag: "no",
      memoryWrite: "no",
    },
  };
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
    const measureClassifierCall =
      input.measureClassifierCall ??
      ((operation: () => Promise<TurnClassificationResult>) => operation());
    const deterministicClassification =
      input.plannerMode === "agentic"
        ? resolveDeterministicTurnClassification({
            userMessage: input.userMessage,
            explicitWebRule: input.explicitWebRule,
            requireClassifierRoutineProposal:
              input.requireClassifierRoutineProposal ?? false,
            hasPendingMemoryApproval: input.hasPendingApproval,
            hasDeterministicCoachingIntent:
              input.hasDeterministicCoachingIntent,
            requiresExternalKnowledge: input.requiresExternalKnowledge,
            inputOrigin: input.inputOrigin,
            responseMode: input.responseMode,
            estimatedInputTokens: input.estimatedInputTokens,
            requestedOutputTokens: input.requestedOutputTokens,
            hasRecentContext: input.hasRecentContext,
          })
        : null;
    classification =
      deterministicClassification ??
      (input.plannerMode === "agentic"
        ? await measureClassifierCall(() =>
            classifyTurn({
              userId: input.userId,
              userMessage: input.userMessage,
              context: input.classifierContext,
              modelId: input.classifierModelId,
              abortSignal: input.abortSignal,
              waitUntil: input.waitUntil,
            }),
          )
        : legacyClassification());
    input.abortSignal?.throwIfAborted();
  } catch (error) {
    input.abortSignal?.throwIfAborted();
    throw error;
  }

  const proposal = normalizeClassifierProposalForArbitration(
    classification.proposal,
  );
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
    classificationSource: classification.classificationSource,
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
    hasRecentContext: input.hasRecentContext,
    hasUntrustedSuppliedText: hasUntrustedSuppliedTextInstructions(
      input.userMessage,
    ),
    deterministicTaskKind: resolveDeterministicTaskKind(input.userMessage),
  });
  input.abortSignal?.throwIfAborted();

  return {
    decision: freezeTurnDecision({
      version: 1,
      capabilities,
      execution,
    }),
    classificationLatencyMs: classification.latencyMs,
    ...(classification.classifierModel
      ? { classifierModel: classification.classifierModel }
      : {}),
    ...(classification.classifierProvider
      ? { classifierProvider: classification.classifierProvider }
      : {}),
  };
}
