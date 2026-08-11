import {
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesRagIntent,
  matchesRoutineProposalIntent,
  shouldEnableWebFetchTool,
} from "@/lib/ai/intent";
import { isDeletableStableMemoryKey } from "./memory-target";

export type CapabilityDecision = {
  rag: boolean;
  webSearch: boolean;
  webFetch: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  memoryDelete: boolean;
  memoryDeleteTarget: string | null;
  routineProposal: boolean;
  userContext: boolean;
  voiceOutput: boolean;
  source: "fallback" | "classifier" | "mixed";
  reasonCodes: string[];
};

export type CapabilityArbitrationInput = {
  userMessage: string;
  isGuest: boolean;
  memoryEnabled: boolean;
  voiceAllowed: boolean;
  responseMode: "text" | "voice";
  explicitWebRule: "required" | "allowed" | "forbidden";
  allowConcurrentRoutineAndWeb?: boolean;
  requireClassifierRoutineProposal?: boolean;
  hasPendingMemoryApproval?: boolean;
  resolvedMemoryTarget?: string | null;
  classifier: Partial<CapabilityDecision> | null;
};

export function freezeCapabilityDecision(
  decision: CapabilityDecision,
): CapabilityDecision {
  if (Object.isFrozen(decision) && Object.isFrozen(decision.reasonCodes)) {
    return decision;
  }

  return Object.freeze({
    ...decision,
    reasonCodes: Object.freeze([...decision.reasonCodes]),
  }) as unknown as CapabilityDecision;
}

export const CLASSIFIER_CAPABILITIES = [
  "rag",
  "webSearch",
  "webFetch",
  "memoryRead",
  "memoryWrite",
  "memoryDelete",
  "routineProposal",
  "userContext",
  "voiceOutput",
] as const;

type ClassifierCapability = (typeof CLASSIFIER_CAPABILITIES)[number];

function normalizeResolvedMemoryTarget(target: string | null | undefined) {
  return isDeletableStableMemoryKey(target) ? target : null;
}

function addReason(reasonCodes: string[], reason: string) {
  if (!reasonCodes.includes(reason)) {
    reasonCodes.push(reason);
  }
}

export function normalizeCapabilityDecision(
  input: CapabilityArbitrationInput,
): CapabilityDecision {
  const reasonCodes: string[] = [];
  const classifier = input.classifier;
  const proposed = (capability: ClassifierCapability) =>
    classifier?.[capability] === true;
  const hasClassifierProposal = Boolean(
    classifier &&
      CLASSIFIER_CAPABILITIES.some((capability) => proposed(capability)),
  );

  const explicitMemoryRead = matchesMemoryReadIntent(input.userMessage);
  const explicitMemoryWrite = matchesMemoryWriteIntent(input.userMessage);
  const explicitMemoryDelete = matchesMemoryDeleteIntent(input.userMessage);
  const persistentMemoryAllowed = !input.isGuest && input.memoryEnabled;

  let webSearch = input.explicitWebRule === "required";
  if (input.explicitWebRule === "allowed" && proposed("webSearch")) {
    webSearch = true;
  }
  if (input.explicitWebRule === "forbidden") {
    webSearch = false;
    addReason(reasonCodes, "web_rule_forbidden");
  }
  if (input.explicitWebRule === "required") {
    addReason(reasonCodes, "web_rule_required");
  }

  const webFetch =
    webSearch &&
    (shouldEnableWebFetchTool(input.userMessage) || proposed("webFetch"));
  const rag = matchesRagIntent(input.userMessage) || proposed("rag");
  let memoryRead =
    persistentMemoryAllowed && (explicitMemoryRead || proposed("memoryRead"));
  let memoryWrite =
    persistentMemoryAllowed &&
    (explicitMemoryWrite ||
      proposed("memoryWrite") ||
      input.hasPendingMemoryApproval === true);
  const resolvedMemoryTarget = normalizeResolvedMemoryTarget(
    input.resolvedMemoryTarget,
  );
  let memoryDelete =
    persistentMemoryAllowed &&
    explicitMemoryDelete &&
    resolvedMemoryTarget !== null;
  let userContext = !input.isGuest && (memoryRead || proposed("userContext"));

  if (!input.memoryEnabled) {
    memoryRead = false;
    memoryWrite = false;
    memoryDelete = false;
    addReason(reasonCodes, "memory_disabled");
  }
  if (input.isGuest) {
    memoryRead = false;
    memoryWrite = false;
    memoryDelete = false;
    userContext = false;
    if (
      explicitMemoryRead ||
      explicitMemoryWrite ||
      explicitMemoryDelete ||
      proposed("memoryRead") ||
      proposed("memoryWrite") ||
      proposed("memoryDelete") ||
      proposed("userContext")
    ) {
      addReason(reasonCodes, "guest_memory_denied");
    }
  }
  if (!explicitMemoryDelete && proposed("memoryDelete")) {
    memoryDelete = false;
    addReason(reasonCodes, "delete_requires_explicit_intent");
  }
  if (explicitMemoryDelete && !resolvedMemoryTarget) {
    memoryDelete = false;
    addReason(reasonCodes, "delete_requires_exact_target");
  }

  const routineProposal =
    (matchesRoutineProposalIntent(input.userMessage) ||
      proposed("routineProposal")) &&
    (input.requireClassifierRoutineProposal !== true ||
      proposed("routineProposal")) &&
    (input.allowConcurrentRoutineAndWeb === true || !webSearch) &&
    input.responseMode !== "voice";
  const voiceOutput = input.responseMode === "voice" && input.voiceAllowed;
  if (input.responseMode === "voice" && !input.voiceAllowed) {
    addReason(reasonCodes, "voice_guard_denied");
  }
  if (!classifier) {
    addReason(reasonCodes, "classifier_unavailable");
  }

  const deterministicSelection =
    input.explicitWebRule !== "allowed" ||
    matchesRagIntent(input.userMessage) ||
    explicitMemoryRead ||
    explicitMemoryWrite ||
    explicitMemoryDelete ||
    input.responseMode === "voice";
  const source = !classifier
    ? "fallback"
    : hasClassifierProposal && deterministicSelection
      ? "mixed"
      : "classifier";

  return freezeCapabilityDecision({
    rag,
    webSearch,
    webFetch,
    memoryRead,
    memoryWrite,
    memoryDelete,
    memoryDeleteTarget: memoryDelete ? resolvedMemoryTarget : null,
    routineProposal,
    userContext,
    voiceOutput,
    source,
    reasonCodes,
  });
}

export function getCapabilityPlannerMode(): "legacy" | "agentic" {
  return process.env.AI_CAPABILITY_PLANNER_MODE === "agentic"
    ? "agentic"
    : "legacy";
}
