import {
  type CapabilityDecision,
  freezeCapabilityDecision,
} from "./capability-arbitration";
import {
  CAPABILITY_CLASSIFIER_MIN_CONFIDENCE,
  type CapabilityClassifierProposal,
  type TaskKind,
  type WorkloadProposal,
} from "./turn-classification";

export const EXECUTION_POLICY_VERSION = 1;
export const TURN_CLASSIFIER_VERSION = 1;
export const LIGHT_MIN_CONFIDENCE = 0.9;
export const LIGHT_MAX_INPUT_TOKENS = 8_000;
export const LIGHT_MAX_OUTPUT_TOKENS = 600;

const LIGHT_TASK_KINDS = [
  "social",
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
] as const;

type LightTaskKind = (typeof LIGHT_TASK_KINDS)[number];

export type ExecutionProfile = "light" | "standard";
export type RoutingMode = "off" | "shadow" | "active";

export type ExecutionReasonCode =
  | "classifier_light"
  | "classifier_standard"
  | "task_allowlisted"
  | "task_not_allowlisted"
  | "low_confidence"
  | "capability_required"
  | "capability_uncertain"
  | "external_knowledge"
  | "deep_context"
  | "sensitive_content"
  | "direct_media"
  | "pending_approval"
  | "voice_output"
  | "input_limit"
  | "output_limit"
  | "classifier_failure"
  | "legacy_mode"
  | "task_rollout_disabled"
  | "rollout_off"
  | "rollout_shadow"
  | "runtime_invariant";

export type ExecutionDecision = {
  eligibleProfile: ExecutionProfile;
  taskKind: TaskKind;
  contextDependency: "none" | "recent" | "deep";
  source: "classifier" | "rule" | "mixed" | "fallback";
  confidenceBucket: "low" | "medium" | "high";
  reasonCodes: ExecutionReasonCode[];
  policyVersion: 1;
  classifierVersion: 1;
};

export type TurnDecision = {
  version: 1;
  capabilities: CapabilityDecision;
  execution: ExecutionDecision;
};

export type ExecutionRoutingConfig = {
  mode: RoutingMode;
  allocationPercent: number;
  enabledTaskKinds: LightTaskKind[];
};

export type ExecutionPolicy = {
  version: 1;
  profile: ExecutionProfile;
  promptProfile: "light" | "existing";
  toolPolicy: "none" | "planned";
  reasoningBudget: "minimal" | "normal";
  maxOutputTokens?: number;
};

export type PlannedExecution = {
  routingMode: RoutingMode;
  eligibleProfile: ExecutionProfile;
  plannedProfile: ExecutionProfile;
  reasonCodes: ExecutionReasonCode[];
  primary: ExecutionPolicy;
  standardFallback?: ExecutionPolicy;
};

export type BuildPlannedExecutionInput = {
  decision: ExecutionDecision;
  config: ExecutionRoutingConfig;
  stableKey: string;
};

type NormalizeExecutionDecisionInput = {
  plannerMode: "legacy" | "agentic";
  classifierOutcome: "accepted" | "invalid" | "low_confidence" | "failed";
  classifierVersion: number;
  capabilityProposal: CapabilityClassifierProposal | null;
  capabilityConfidence: number;
  workload: WorkloadProposal | null;
  capabilities: CapabilityDecision;
  hasDeterministicCoachingIntent: boolean;
  requiresExternalKnowledge: boolean;
  inputOrigin: "text" | "direct_media";
  hasPendingApproval: boolean;
  responseMode: "text" | "voice";
  estimatedInputTokens: number;
  requestedOutputTokens: number;
};

const EMPTY_ROUTING_CONFIG: ExecutionRoutingConfig = {
  mode: "off",
  allocationPercent: 0,
  enabledTaskKinds: [],
};

function addReason(
  reasonCodes: ExecutionReasonCode[],
  reason: ExecutionReasonCode,
) {
  if (!reasonCodes.includes(reason)) {
    reasonCodes.push(reason);
  }
}

function isLightTaskKind(taskKind: TaskKind): taskKind is LightTaskKind {
  return LIGHT_TASK_KINDS.includes(taskKind as LightTaskKind);
}

function hasUncertainCapability(
  proposal: CapabilityClassifierProposal | null,
): boolean {
  if (!proposal) return false;
  return Object.values(proposal).some((decision) => decision === "uncertain");
}

function hasRequiredCapability(decision: CapabilityDecision): boolean {
  return (
    decision.rag ||
    decision.webSearch ||
    decision.webFetch ||
    decision.memoryRead ||
    decision.memoryWrite ||
    decision.memoryDelete ||
    decision.routineProposal ||
    decision.userContext
  );
}

function freezeExecutionDecision(
  decision: ExecutionDecision,
): ExecutionDecision {
  if (Object.isFrozen(decision) && Object.isFrozen(decision.reasonCodes)) {
    return decision;
  }

  return Object.freeze({
    ...decision,
    reasonCodes: Object.freeze([...decision.reasonCodes]),
  }) as unknown as ExecutionDecision;
}

function freezePlannedExecution(result: PlannedExecution): PlannedExecution {
  if (
    Object.isFrozen(result) &&
    Object.isFrozen(result.reasonCodes) &&
    Object.isFrozen(result.primary) &&
    (!result.standardFallback || Object.isFrozen(result.standardFallback))
  ) {
    return result;
  }

  return Object.freeze({
    ...result,
    reasonCodes: Object.freeze([...result.reasonCodes]),
    primary: Object.freeze({ ...result.primary }),
    ...(result.standardFallback
      ? { standardFallback: Object.freeze({ ...result.standardFallback }) }
      : {}),
  }) as unknown as PlannedExecution;
}

function toConfidenceBucket(
  confidence: number | null,
): ExecutionDecision["confidenceBucket"] {
  if (
    confidence === null ||
    confidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE
  ) {
    return "low";
  }
  if (confidence < LIGHT_MIN_CONFIDENCE) {
    return "medium";
  }
  return "high";
}

export function normalizeExecutionDecision(
  input: NormalizeExecutionDecisionInput,
): ExecutionDecision {
  const workload = input.workload;
  const reasonCodes: ExecutionReasonCode[] = [];
  const taskKind = workload?.taskKind ?? "other";
  const contextDependency = workload?.contextDependency ?? "deep";
  const confidenceBucket = toConfidenceBucket(workload?.confidence ?? null);
  const uncertainCapability =
    input.capabilityConfidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE ||
    hasUncertainCapability(input.capabilityProposal);
  const capabilityRequired = hasRequiredCapability(input.capabilities);
  const hasFallbackFailure =
    input.plannerMode !== "agentic" ||
    input.classifierOutcome === "failed" ||
    input.classifierOutcome === "low_confidence" ||
    input.classifierOutcome === "invalid" ||
    input.workload === null ||
    input.classifierVersion !== TURN_CLASSIFIER_VERSION;

  if (input.plannerMode !== "agentic") {
    addReason(reasonCodes, "legacy_mode");
  }

  if (
    input.classifierOutcome === "failed" ||
    input.classifierOutcome === "invalid"
  ) {
    addReason(reasonCodes, "classifier_failure");
  }

  if (input.classifierVersion !== TURN_CLASSIFIER_VERSION) {
    addReason(reasonCodes, "runtime_invariant");
  }

  if (workload?.suggestedProfile === "light") {
    addReason(reasonCodes, "classifier_light");
  } else {
    addReason(reasonCodes, "classifier_standard");
  }

  if (isLightTaskKind(taskKind)) {
    addReason(reasonCodes, "task_allowlisted");
  } else {
    addReason(reasonCodes, "task_not_allowlisted");
  }

  if (
    input.classifierOutcome === "low_confidence" ||
    !workload ||
    workload.confidence < LIGHT_MIN_CONFIDENCE
  ) {
    addReason(reasonCodes, "low_confidence");
  }

  if (uncertainCapability) {
    addReason(reasonCodes, "capability_uncertain");
  }

  if (capabilityRequired) {
    addReason(reasonCodes, "capability_required");
  }

  if (
    workload?.knowledgeNeed === "external" ||
    input.requiresExternalKnowledge
  ) {
    addReason(reasonCodes, "external_knowledge");
  }

  if (workload?.contextDependency === "deep") {
    addReason(reasonCodes, "deep_context");
  }

  if (
    workload?.sensitivity === "coaching" ||
    workload?.reasoningDepth === "substantive" ||
    input.hasDeterministicCoachingIntent
  ) {
    addReason(reasonCodes, "sensitive_content");
  }

  if (input.inputOrigin === "direct_media") {
    addReason(reasonCodes, "direct_media");
  }

  if (input.hasPendingApproval) {
    addReason(reasonCodes, "pending_approval");
  }

  if (input.responseMode === "voice" || input.capabilities.voiceOutput) {
    addReason(reasonCodes, "voice_output");
  }

  if (input.estimatedInputTokens > LIGHT_MAX_INPUT_TOKENS) {
    addReason(reasonCodes, "input_limit");
  }

  if (input.requestedOutputTokens > LIGHT_MAX_OUTPUT_TOKENS) {
    addReason(reasonCodes, "output_limit");
  }

  const lightEligible =
    !hasFallbackFailure &&
    workload?.suggestedProfile === "light" &&
    workload.confidence >= LIGHT_MIN_CONFIDENCE &&
    input.capabilityConfidence >= CAPABILITY_CLASSIFIER_MIN_CONFIDENCE &&
    isLightTaskKind(taskKind) &&
    workload.reasoningDepth === "minimal" &&
    workload.contextDependency !== "deep" &&
    workload.knowledgeNeed !== "external" &&
    workload.sensitivity === "ordinary" &&
    !input.hasDeterministicCoachingIntent &&
    !input.requiresExternalKnowledge &&
    !capabilityRequired &&
    !uncertainCapability &&
    input.inputOrigin === "text" &&
    !input.hasPendingApproval &&
    input.responseMode === "text" &&
    !input.capabilities.voiceOutput &&
    input.estimatedInputTokens <= LIGHT_MAX_INPUT_TOKENS &&
    input.requestedOutputTokens <= LIGHT_MAX_OUTPUT_TOKENS;

  const eligibleProfile: ExecutionProfile = lightEligible
    ? "light"
    : "standard";

  let source: ExecutionDecision["source"] = "rule";
  if (hasFallbackFailure) {
    source = "fallback";
  } else if (eligibleProfile === "light") {
    source = "classifier";
  } else if (workload?.suggestedProfile === "light") {
    source = "mixed";
  } else {
    source = "classifier";
  }

  return freezeExecutionDecision({
    eligibleProfile,
    taskKind,
    contextDependency,
    source,
    confidenceBucket,
    reasonCodes,
    policyVersion: EXECUTION_POLICY_VERSION,
    classifierVersion: TURN_CLASSIFIER_VERSION,
  });
}

export function freezeTurnDecision(decision: TurnDecision): TurnDecision {
  const capabilities = freezeCapabilityDecision(decision.capabilities);
  const execution = freezeExecutionDecision(decision.execution);

  if (
    Object.isFrozen(decision) &&
    capabilities === decision.capabilities &&
    execution === decision.execution
  ) {
    return decision;
  }

  return Object.freeze({
    ...decision,
    capabilities,
    execution,
  }) as unknown as TurnDecision;
}

export function parseExecutionRoutingConfig(
  env: Record<string, string | undefined>,
): ExecutionRoutingConfig {
  const mode = env.AI_EXECUTION_ROUTING_MODE;
  if (mode !== "off" && mode !== "shadow" && mode !== "active") {
    return EMPTY_ROUTING_CONFIG;
  }

  const allocationPercentRaw = env.AI_EXECUTION_ROUTING_ALLOCATION_PERCENT;
  const allocationPercent = Number(allocationPercentRaw);
  if (
    !Number.isFinite(allocationPercent) ||
    allocationPercent < 0 ||
    allocationPercent > 100
  ) {
    return EMPTY_ROUTING_CONFIG;
  }

  const taskList = env.AI_EXECUTION_ROUTING_TASKS?.trim();
  const enabledTaskKinds = taskList
    ? taskList.split(",").map((taskKind) => taskKind.trim())
    : [];

  if (
    !enabledTaskKinds.every((taskKind) => isLightTaskKind(taskKind as TaskKind))
  ) {
    return EMPTY_ROUTING_CONFIG;
  }

  return {
    mode,
    allocationPercent,
    enabledTaskKinds: enabledTaskKinds as LightTaskKind[],
  };
}

function hashStableKey(stableKey: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash ^= stableKey.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function isAllocated(stableKey: string, allocationPercent: number): boolean {
  if (allocationPercent <= 0) return false;
  if (allocationPercent >= 100) return true;
  const bucket = hashStableKey(stableKey) % 10_000;
  return bucket < allocationPercent * 100;
}

function resolvePlannedProfileSelection(
  decision: ExecutionDecision,
  config: ExecutionRoutingConfig,
  stableKey: string,
): Pick<
  PlannedExecution,
  "routingMode" | "eligibleProfile" | "plannedProfile" | "reasonCodes"
> {
  const reasonCodes: ExecutionReasonCode[] = [];

  if (config.mode === "off") {
    addReason(reasonCodes, "rollout_off");
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  if (config.mode === "shadow") {
    addReason(reasonCodes, "rollout_shadow");
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  if (decision.eligibleProfile !== "light") {
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  if (!isLightTaskKind(decision.taskKind)) {
    addReason(reasonCodes, "runtime_invariant");
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  if (!config.enabledTaskKinds.includes(decision.taskKind)) {
    addReason(reasonCodes, "task_rollout_disabled");
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  if (!isAllocated(stableKey, config.allocationPercent)) {
    return {
      routingMode: config.mode,
      eligibleProfile: decision.eligibleProfile,
      plannedProfile: "standard",
      reasonCodes,
    };
  }

  return {
    routingMode: config.mode,
    eligibleProfile: decision.eligibleProfile,
    plannedProfile: "light",
    reasonCodes,
  };
}

function standardExecutionPolicy(): ExecutionPolicy {
  return {
    version: 1,
    profile: "standard",
    promptProfile: "existing",
    toolPolicy: "planned",
    reasoningBudget: "normal",
  };
}

function lightExecutionPolicy(): ExecutionPolicy {
  return {
    version: 1,
    profile: "light",
    promptProfile: "light",
    toolPolicy: "none",
    reasoningBudget: "minimal",
    maxOutputTokens: LIGHT_MAX_OUTPUT_TOKENS,
  };
}

export function buildPlannedExecution({
  decision,
  config,
  stableKey,
}: BuildPlannedExecutionInput): PlannedExecution {
  const selection = resolvePlannedProfileSelection(decision, config, stableKey);
  const light = selection.plannedProfile === "light";

  return freezePlannedExecution({
    ...selection,
    primary: light ? lightExecutionPolicy() : standardExecutionPolicy(),
    ...(light ? { standardFallback: standardExecutionPolicy() } : {}),
  });
}

export function resolvePlannedProfile(
  decision: ExecutionDecision,
  config: ExecutionRoutingConfig,
  stableKey: string,
): PlannedExecution {
  return buildPlannedExecution({ decision, config, stableKey });
}
