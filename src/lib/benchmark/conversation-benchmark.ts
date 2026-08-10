import type { serializeRealityBenchmarkSummary } from "./reality-cli";

export const CONVERSATION_ARTIFACT_VERSION = 1 as const;
export const CONVERSATION_SCENARIO_VERSION = "conversation-v1" as const;
export const CONVERSATION_MODEL_ID = "openai/gpt-5.6-luna" as const;

export type ConversationalDimensions = {
  contextUse: number;
  conversationalNaturalness: number;
  discoveryBeforeAdvice: number;
  multiTurnProgression: number;
  questionQuality: number;
};

export type StructuralDiagnostics = {
  acknowledgmentListQuestion: boolean;
  endsWithQuestion: boolean;
  formulaicOpening: boolean;
  hasMarkdownList: boolean;
  hasQuestion: boolean;
  phraseHits: string[];
  wordCount: number;
};

export type ConversationReplica = {
  replicaId: string;
  scenarioId: string;
  turnIndex: number;
  assistantText: string;
  diagnostics: StructuralDiagnostics;
  metrics: {
    costUsd: number;
    generationTimeMs: number;
    inputTokens: number;
    outputTokens: number;
  };
  guardrails: {
    safety: number;
    concision: number;
    coachingUsefulness: number;
  };
};

export type ConversationRunArtifact = {
  artifactVersion: typeof CONVERSATION_ARTIFACT_VERSION;
  scenarioVersion: typeof CONVERSATION_SCENARIO_VERSION;
  variant: "baseline" | "candidate";
  label: string;
  commit: string;
  createdAt: string;
  modelId: typeof CONVERSATION_MODEL_ID;
  samples: number;
  scenarioIds: string[];
  configurationFingerprint: string;
  summaries: Array<ReturnType<typeof serializeRealityBenchmarkSummary>>;
  replicas: ConversationReplica[];
};

export type ConversationVerdict =
  | "baseline"
  | "candidate"
  | "tie"
  | "both_insufficient";

export type ConversationComparisonPair = {
  key: string;
  scenarioId: string;
  turnIndex: number;
  replicaId: string;
  baselineText: string;
  candidateText: string;
  verdicts: ConversationVerdict[];
  dimensionsBaseline: ConversationalDimensions;
  dimensionsCandidate: ConversationalDimensions;
  reasons: string[];
  disagreement: boolean;
  safetyRegression: boolean;
};

export type ConversationComparisonArtifact = {
  artifactVersion: typeof CONVERSATION_ARTIFACT_VERSION;
  createdAt: string;
  baselineLabel: string;
  candidateLabel: string;
  baselineCommit: string;
  candidateCommit: string;
  modelId: typeof CONVERSATION_MODEL_ID;
  scenarioVersion: typeof CONVERSATION_SCENARIO_VERSION;
  samples: number;
  verdictCounts: Record<ConversationVerdict, number>;
  dimensionsBaseline: ConversationalDimensions;
  dimensionsCandidate: ConversationalDimensions;
  guardrailDeltas: {
    safety: number;
    concisionPercent: number;
    coachingUsefulness: number;
    latencyPercent: number;
    costPercent: number;
  };
  structuralBaseline: StructuralDiagnostics;
  structuralCandidate: StructuralDiagnostics;
  totalJudgeCostUsd: number;
  pairs: ConversationComparisonPair[];
};

const phrases = [
  "capisco",
  "certo",
  "perfetto",
  "è normale",
  "prossima azione",
  "vuoi",
];

export function diagnoseConversationStructure(
  text: string,
): StructuralDiagnostics {
  const normalized = text.trim().toLocaleLowerCase("it");
  const phraseHits = phrases.filter((phrase) => normalized.includes(phrase));
  const formulaicOpening = /^(capisco|certo|perfetto|è normale)\b/i.test(
    normalized,
  );
  const hasMarkdownList = /^(?:\s*[-*+]\s+|\s*\d+[.)]\s+)/m.test(text);
  const hasQuestion = /[?？]/.test(text);
  const endsWithQuestion = /[?？][\s”"']*$/.test(text);
  return {
    acknowledgmentListQuestion:
      formulaicOpening && hasMarkdownList && hasQuestion,
    endsWithQuestion,
    formulaicOpening,
    hasMarkdownList,
    hasQuestion,
    phraseHits,
    wordCount: text.trim() ? text.trim().split(/\s+/u).length : 0,
  };
}

export function conversationReplicaKey(
  replica: Pick<ConversationReplica, "scenarioId" | "turnIndex" | "replicaId">,
) {
  return `${replica.scenarioId}:${replica.turnIndex}:${replica.replicaId}`;
}

export function assertCompatibleConversationRuns(
  baseline: ConversationRunArtifact,
  candidate: ConversationRunArtifact,
) {
  if (baseline.variant !== "baseline" || candidate.variant !== "candidate") {
    throw new Error("variant mismatch: expected baseline and candidate");
  }
  const fields = [
    "artifactVersion",
    "scenarioVersion",
    "modelId",
    "samples",
  ] as const;
  for (const field of fields) {
    if (baseline[field] !== candidate[field]) {
      throw new Error(`${field} mismatch`);
    }
  }
  if (
    [...baseline.scenarioIds].sort().join("\n") !==
    [...candidate.scenarioIds].sort().join("\n")
  ) {
    throw new Error("scenarioIds mismatch");
  }
  const keys = (artifact: ConversationRunArtifact) =>
    artifact.replicas.map(conversationReplicaKey).sort();
  const baselineKeys = keys(baseline);
  const candidateKeys = keys(candidate);
  if (new Set(baselineKeys).size !== baselineKeys.length) {
    throw new Error("baseline replica keys are not unique");
  }
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new Error("candidate replica keys are not unique");
  }
  if (baselineKeys.join("\n") !== candidateKeys.join("\n")) {
    throw new Error("replica keys mismatch");
  }
}
