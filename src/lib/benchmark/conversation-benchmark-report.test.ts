import { describe, expect, it } from "vitest";
import type { ConversationComparisonArtifact } from "./conversation-benchmark";
import {
  formatConversationComparisonReport,
  parseConversationComparison,
  serializeConversationComparison,
} from "./conversation-benchmark-report";

const dimensions = {
  contextUse: 8,
  conversationalNaturalness: 7,
  discoveryBeforeAdvice: 9,
  multiTurnProgression: 8,
  questionQuality: 9,
};
const structural = {
  acknowledgmentListQuestion: false,
  endsWithQuestion: false,
  formulaicOpening: false,
  hasMarkdownList: false,
  hasQuestion: true,
  phraseHits: [],
  wordCount: 20,
};

const comparison: ConversationComparisonArtifact = {
  artifactVersion: 1,
  createdAt: "2026-08-10T10:00:00.000Z",
  baselineLabel: "before",
  candidateLabel: "after",
  baselineCommit: "a".repeat(40),
  candidateCommit: "b".repeat(40),
  modelId: "openai/gpt-5.6-luna",
  scenarioVersion: "conversation-v1",
  samples: 3,
  verdictCounts: { baseline: 1, candidate: 4, tie: 1, both_insufficient: 0 },
  dimensionsBaseline: { ...dimensions, questionQuality: 5 },
  dimensionsCandidate: dimensions,
  guardrailDeltas: {
    safety: -1,
    concisionPercent: -6,
    coachingUsefulness: 1,
    latencyPercent: 8,
    costPercent: 2,
  },
  structuralBaseline: structural,
  structuralCandidate: structural,
  totalJudgeCostUsd: 0.2,
  pairs: [
    {
      key: "scenario:0:sample-1",
      scenarioId: "scenario",
      turnIndex: 0,
      replicaId: "sample-1",
      baselineText: "Prima risposta sintetica",
      candidateText: "Seconda risposta sintetica",
      verdicts: ["candidate", "candidate"],
      dimensionsBaseline: { ...dimensions, questionQuality: 5 },
      dimensionsCandidate: dimensions,
      reasons: ["Domanda migliore"],
      disagreement: false,
      safetyRegression: true,
    },
  ],
};

describe("benchmark/conversation-benchmark-report", () => {
  it("round trips a strict comparison artifact", () => {
    expect(
      parseConversationComparison(serializeConversationComparison(comparison)),
    ).toEqual(comparison);
  });

  it("renders safety and attention diagnostics before scenario review", () => {
    const report = formatConversationComparisonReport(comparison);
    for (const heading of [
      "Decision Summary",
      "Pairwise Results",
      "Conversational Dimensions",
      "Guardrail Deltas",
      "Structural Diagnostics",
      "Judge Disagreements",
      "Scenario Review",
    ]) {
      expect(report).toContain(`## ${heading}`);
    }
    expect(report).toContain("BLOCKING REVIEW");
    expect(report).toContain("ATTENTION");
    expect(report).toContain("Prima risposta sintetica");
    expect(report.indexOf("BLOCKING REVIEW")).toBeLessThan(
      report.indexOf("Scenario Review"),
    );
  });
});
