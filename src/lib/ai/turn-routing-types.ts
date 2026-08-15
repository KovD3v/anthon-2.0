import type { CLASSIFIER_CAPABILITIES } from "./capability-arbitration";

export const DEFAULT_TURN_CLASSIFIER_MODEL_ID =
  "nvidia/nemotron-3.5-lightning" as const;

export const TASK_KINDS = [
  "social",
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
  "coaching",
  "knowledge",
  "planning",
  "other",
] as const;

export const CAPABILITY_CLASSIFIER_MIN_CONFIDENCE = 0.7;

export type TaskKind = (typeof TASK_KINDS)[number];
export type ClassifierCapabilityValue = "yes" | "no" | "uncertain";

export type CapabilityClassifierProposal = Record<
  (typeof CLASSIFIER_CAPABILITIES)[number],
  ClassifierCapabilityValue
>;

export type WorkloadProposal = {
  taskKind: TaskKind;
  contextDependency: "none" | "recent" | "deep";
  knowledgeNeed: "supplied_only" | "conversation" | "external";
  reasoningDepth: "minimal" | "substantive";
  sensitivity: "ordinary" | "coaching";
  suggestedProfile: "light" | "standard";
  confidence: number;
};

export type TurnClassifierProposal = {
  capabilities: CapabilityClassifierProposal;
  capabilityConfidence: number;
  workload: WorkloadProposal;
};

export type TurnClassificationResult = {
  proposal: TurnClassifierProposal | null;
  outcome: "accepted" | "invalid" | "low_confidence" | "failed";
  latencyMs: number;
  classificationSource?: "classifier" | "rule";
  classifierModel?: string;
  classifierProvider?: string;
};
