import {
  type CapabilityArbitrationInput,
  type CapabilityDecision,
  normalizeCapabilityDecision,
} from "./capability-arbitration";
import { freezeTurnDecision, type TurnDecision } from "./turn-decision";

export type TurnArbitrationInput = Omit<
  CapabilityArbitrationInput,
  "classifier"
> & {
  /** Retained as a source-compatible field for prepared channel callers. */
  plannerMode?: "legacy" | "agentic";
  hasDeterministicCoachingIntent?: boolean;
  requiresExternalKnowledge?: boolean;
  inputOrigin?: "text" | "direct_media";
  hasPendingApproval?: boolean;
  estimatedInputTokens?: number;
  requestedOutputTokens?: number;
  hasRecentContext?: boolean;
  abortSignal?: AbortSignal;
};

export type TurnArbitrationResult = {
  decision: TurnDecision;
};

function buildCapabilityDecision(
  input: TurnArbitrationInput,
): CapabilityDecision {
  return normalizeCapabilityDecision({
    userMessage: input.userMessage,
    isGuest: input.isGuest,
    memoryEnabled: input.memoryEnabled,
    voiceAllowed: input.voiceAllowed,
    responseMode: input.responseMode,
    explicitWebRule: input.explicitWebRule,
    // A single agentic path exposes independently authorized tools. The
    // model may choose a routine together with web/RAG when both are safe.
    allowConcurrentRoutineAndWeb: true,
    requireClassifierRoutineProposal: false,
    hasPendingMemoryApproval: input.hasPendingMemoryApproval,
    resolvedMemoryTarget: input.resolvedMemoryTarget,
    classifierSource: "rule",
    classifier: null,
  });
}

/**
 * Resolves only deterministic capability and authorization gates.
 *
 * There is deliberately no live classifier call and no execution-profile
 * allocation here. The standard model receives the authorized tool inventory
 * and chooses which tools to use in its normal agentic generation.
 */
export async function arbitrateTurn(
  input: TurnArbitrationInput,
): Promise<TurnArbitrationResult> {
  input.abortSignal?.throwIfAborted();
  const capabilities = buildCapabilityDecision(input);
  input.abortSignal?.throwIfAborted();

  return {
    decision: freezeTurnDecision({
      version: 1,
      capabilities,
    }),
  };
}
