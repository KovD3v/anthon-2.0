import {
  hasUntrustedSuppliedTextInstructions,
  LIGHT_MAX_INPUT_TOKENS,
  LIGHT_MAX_OUTPUT_TOKENS,
  resolveDeterministicTaskKind,
} from "./execution-routing";
import {
  matchesComplexCoachingIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesNotesWriteIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesRagIntent,
  matchesRoutineProposalIntent,
  matchesVoiceIntent,
} from "./intent";
import type {
  CapabilityClassifierProposal,
  TaskKind,
  TurnClassificationResult,
  TurnClassifierProposal,
} from "./turn-classification";

export type DeterministicRoutingInput = {
  userMessage: string;
  explicitWebRule: "required" | "allowed" | "forbidden";
  requireClassifierRoutineProposal: boolean;
  hasPendingMemoryApproval: boolean;
  hasDeterministicCoachingIntent: boolean;
  requiresExternalKnowledge: boolean;
  inputOrigin: "text" | "direct_media";
  responseMode: "text" | "voice";
  estimatedInputTokens: number;
  requestedOutputTokens: number;
  hasRecentContext: boolean;
};

const SELF_CONTAINED_TRANSFORM_SOURCE =
  /:\s*\S|[“"][^”"]+[”"]|‘[^’]+’|'[^']+'/u;
const GENERIC_PLANNING_INTENT =
  /\b(proponi\w*|proponimi|sequenza\s+di\s+passi|passi\s+per|prepara\w*\s+(?:una\s+)?presentazione|propose|sequence\s+of\s+steps|steps\s+to|plan\s+for|planning)\b/i;
const ENGLISH_RAG_INTENT =
  /\b(document|documents|pdf|file|files|uploaded|upload|source|sources|notes|chapter)\b/i;

const SOCIAL_MESSAGES = new Set([
  "ciao",
  "ciao come va",
  "come stai",
  "come va",
  "ehi",
  "hey",
  "buongiorno",
  "buonasera",
  "grazie",
  "grazie mille",
  "grazie mi sei stato utile",
  "hello",
  "hello how are you",
  "how are you",
  "hi",
  "hi how are you",
  "thanks",
  "thanks that helped",
  "thanks that was helpful",
  "thank you",
]);

function noCapabilities(): CapabilityClassifierProposal {
  return {
    rag: "no",
    webSearch: "no",
    webFetch: "no",
    memoryRead: "no",
    memoryWrite: "no",
    memoryDelete: "no",
    routineProposal: "no",
    userContext: "no",
    voiceOutput: "no",
  };
}

function normalizeSocialMessage(message: string) {
  return message
    .toLocaleLowerCase("it-IT")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTransformTaskKind(
  message: string,
): Exclude<
  TaskKind,
  "social" | "coaching" | "knowledge" | "planning" | "other"
> | null {
  if (/\b(traduc\w*|translat\w*)\b/i.test(message)) return "translate";
  if (/\b(format\w*|elenc\w*|checklist|bullet)\b/i.test(message)) {
    return "format";
  }
  if (/\b(estrai|estrarre|extract)\b/i.test(message)) return "extract";
  if (/\b(riassum\w*|sintetizz\w*|summari[sz]\w*)\b/i.test(message)) {
    return "summarize_supplied";
  }
  if (
    /\b(riscriv\w*|rendi\w*|riscrivere|rewrite|rephrase|parafrasa\w*)\b|\bmake\s+(?:it|this)\s+(?:sound\s+)?(?:more\s+)?(?:natural|clear|professional|kind|kinder|gentle|gentler|short|shorter)\b/i.test(
      message,
    )
  ) {
    return "rewrite";
  }
  return null;
}

function resolveSelfContainedTransformTaskKind(
  message: string,
): Exclude<
  TaskKind,
  "social" | "coaching" | "knowledge" | "planning" | "other"
> | null {
  if (!SELF_CONTAINED_TRANSFORM_SOURCE.test(message)) return null;
  return resolveTransformTaskKind(message);
}

function isSimpleSocialMessage(message: string) {
  return SOCIAL_MESSAGES.has(normalizeSocialMessage(message));
}

/**
 * Recent history is only needed to resolve an otherwise context-dependent
 * transform such as "rendilo piu breve". Social turns and transforms that
 * include their own source can be routed without a history lookup.
 */
export function needsRecentRoutingContext(userMessage: string): boolean {
  return (
    !isSimpleSocialMessage(userMessage) &&
    !resolveSelfContainedTransformTaskKind(userMessage) &&
    Boolean(resolveTransformTaskKind(userMessage))
  );
}

function isDeterministicRagIntent(message: string) {
  return matchesRagIntent(message) || ENGLISH_RAG_INTENT.test(message);
}

function resolveDeterministicTaskKindForMessage(
  input: DeterministicRoutingInput,
): TaskKind {
  const explicitTaskKind = resolveDeterministicTaskKind(input.userMessage);
  if (explicitTaskKind) return explicitTaskKind;
  if (isSimpleSocialMessage(input.userMessage)) return "social";
  if (
    input.requiresExternalKnowledge ||
    input.explicitWebRule === "required" ||
    isDeterministicRagIntent(input.userMessage)
  ) {
    return "knowledge";
  }
  const transformTaskKind = resolveTransformTaskKind(input.userMessage);
  if (transformTaskKind) return transformTaskKind;
  if (GENERIC_PLANNING_INTENT.test(input.userMessage)) return "planning";
  if (
    input.hasDeterministicCoachingIntent ||
    matchesComplexCoachingIntent(input.userMessage)
  ) {
    return "coaching";
  }
  return resolveSelfContainedTransformTaskKind(input.userMessage) ?? "other";
}

function buildDeterministicProposal(
  input: DeterministicRoutingInput,
  suggestedProfile: "light" | "standard",
): TurnClassifierProposal {
  const taskKind = resolveDeterministicTaskKindForMessage(input);
  const transformTaskKind = resolveTransformTaskKind(input.userMessage);
  const complexCoaching =
    input.hasDeterministicCoachingIntent ||
    (!transformTaskKind && matchesComplexCoachingIntent(input.userMessage));
  const hasRagIntent = isDeterministicRagIntent(input.userMessage);
  const hasRoutineIntent =
    !input.requireClassifierRoutineProposal &&
    matchesRoutineProposalIntent(input.userMessage);
  const hasExternalKnowledge =
    input.requiresExternalKnowledge || input.explicitWebRule === "required";
  const social = isSimpleSocialMessage(input.userMessage);

  const capabilities = noCapabilities();
  if (hasRagIntent) capabilities.rag = "yes";
  if (hasExternalKnowledge) capabilities.webSearch = "yes";
  if (hasRoutineIntent) capabilities.routineProposal = "yes";
  if (complexCoaching) capabilities.userContext = "yes";
  if (input.responseMode === "voice" || matchesVoiceIntent(input.userMessage)) {
    capabilities.voiceOutput = "yes";
  }

  const contextDependency = social
    ? "none"
    : hasRagIntent || hasExternalKnowledge || complexCoaching
      ? "deep"
      : input.hasRecentContext
        ? "recent"
        : "none";
  const knowledgeNeed = social
    ? "supplied_only"
    : hasExternalKnowledge
      ? "external"
      : hasRagIntent || input.hasRecentContext
        ? "conversation"
        : "supplied_only";
  const reasoningDepth =
    suggestedProfile === "standard" ? "substantive" : "minimal";
  const sensitivity =
    complexCoaching || hasRoutineIntent ? "coaching" : "ordinary";

  return {
    capabilities,
    capabilityConfidence: 1,
    workload: {
      taskKind,
      contextDependency,
      knowledgeNeed,
      reasoningDepth,
      sensitivity,
      suggestedProfile,
      confidence: 1,
    },
  };
}

function resultFromRule(
  input: DeterministicRoutingInput,
  suggestedProfile: "light" | "standard",
): TurnClassificationResult {
  return {
    proposal: buildDeterministicProposal(input, suggestedProfile),
    outcome: "accepted",
    latencyMs: 0,
    classificationSource: "rule",
  };
}

function isSafeLightCandidate(input: DeterministicRoutingInput): boolean {
  const taskKind = resolveSelfContainedTransformTaskKind(input.userMessage);
  const contextualTransformTaskKind = resolveTransformTaskKind(
    input.userMessage,
  );
  const social = isSimpleSocialMessage(input.userMessage);
  if (!taskKind && !contextualTransformTaskKind && !social) return false;
  if (!taskKind && !social && !input.hasRecentContext) return false;
  const usesRecentContext =
    !taskKind && Boolean(contextualTransformTaskKind) && input.hasRecentContext;

  return (
    input.inputOrigin === "text" &&
    input.responseMode === "text" &&
    !input.hasPendingMemoryApproval &&
    (!input.hasRecentContext || taskKind || social || usesRecentContext) &&
    input.explicitWebRule !== "required" &&
    !input.requiresExternalKnowledge &&
    !input.hasDeterministicCoachingIntent &&
    (!matchesComplexCoachingIntent(input.userMessage) || Boolean(taskKind)) &&
    !isDeterministicRagIntent(input.userMessage) &&
    !matchesMemoryReadIntent(input.userMessage) &&
    !matchesMemoryWriteIntent(input.userMessage) &&
    !matchesMemoryDeleteIntent(input.userMessage) &&
    !matchesRoutineProposalIntent(input.userMessage) &&
    !matchesVoiceIntent(input.userMessage) &&
    !matchesProfileWriteIntent(input.userMessage) &&
    !matchesPreferenceWriteIntent(input.userMessage) &&
    !matchesNotesWriteIntent(input.userMessage) &&
    !hasUntrustedSuppliedTextInstructions(input.userMessage) &&
    input.estimatedInputTokens <= LIGHT_MAX_INPUT_TOKENS &&
    input.requestedOutputTokens <= LIGHT_MAX_OUTPUT_TOKENS
  );
}

function isDeterministicStandardCandidate(
  input: DeterministicRoutingInput,
): boolean {
  if (
    input.requireClassifierRoutineProposal &&
    matchesRoutineProposalIntent(input.userMessage)
  ) {
    return false;
  }

  return (
    input.inputOrigin !== "text" ||
    input.responseMode !== "text" ||
    input.hasPendingMemoryApproval ||
    input.explicitWebRule === "required" ||
    input.requiresExternalKnowledge ||
    input.hasDeterministicCoachingIntent ||
    matchesComplexCoachingIntent(input.userMessage) ||
    isDeterministicRagIntent(input.userMessage) ||
    matchesMemoryReadIntent(input.userMessage) ||
    matchesMemoryWriteIntent(input.userMessage) ||
    matchesMemoryDeleteIntent(input.userMessage) ||
    matchesRoutineProposalIntent(input.userMessage) ||
    matchesVoiceIntent(input.userMessage) ||
    matchesProfileWriteIntent(input.userMessage) ||
    matchesPreferenceWriteIntent(input.userMessage) ||
    matchesNotesWriteIntent(input.userMessage) ||
    hasUntrustedSuppliedTextInstructions(input.userMessage) ||
    input.estimatedInputTokens > LIGHT_MAX_INPUT_TOKENS ||
    input.requestedOutputTokens > LIGHT_MAX_OUTPUT_TOKENS
  );
}

export function resolveDeterministicTurnClassification(
  input: DeterministicRoutingInput,
  options: { fallbackToStandard?: boolean } = {},
): TurnClassificationResult | null {
  if (isSafeLightCandidate(input)) return resultFromRule(input, "light");
  if (isDeterministicStandardCandidate(input)) {
    return resultFromRule(input, "standard");
  }
  if (options.fallbackToStandard) return resultFromRule(input, "standard");
  return null;
}
