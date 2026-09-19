import { z } from "zod";
import {
  CONVERSATION_SCENARIO_VERSION,
  type ConversationalDimensions,
  type ConversationComparisonArtifact,
  type ConversationRunArtifact,
  diagnoseConversationStructure,
} from "./conversation-benchmark";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";

const forbiddenKeys = new Set([
  "apiKey",
  "authorization",
  "cookie",
  "systemPrompt",
  "tracePayload",
]);

function assertSafeJson(value: unknown, path = "artifact") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key))
      throw new Error(`Forbidden secret field ${path}.${key}`);
    assertSafeJson(child, `${path}.${key}`);
  }
}

export function serializeConversationRun(artifact: ConversationRunArtifact) {
  assertSafeJson(artifact);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function parseConversationRun(value: string): ConversationRunArtifact {
  const parsed = JSON.parse(value) as ConversationRunArtifact;
  assertSafeJson(parsed);
  if (
    parsed.artifactVersion !== 1 ||
    parsed.scenarioVersion !== CONVERSATION_SCENARIO_VERSION
  ) {
    throw new Error("Unsupported conversation run artifact version");
  }
  if (parsed.modelId !== "openai/gpt-5.6-luna")
    throw new Error("Unexpected modelId");
  if (!Number.isInteger(parsed.samples) || parsed.samples < 1)
    throw new Error("Invalid samples");
  if (!Array.isArray(parsed.replicas) || !Array.isArray(parsed.summaries))
    throw new Error("Invalid run payload");
  if (!Number.isFinite(Date.parse(parsed.createdAt)))
    throw new Error("Invalid createdAt");
  return parsed;
}

export function serializeConversationComparison(
  artifact: ConversationComparisonArtifact,
) {
  assertSafeJson(artifact);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function parseConversationComparison(
  value: string,
): ConversationComparisonArtifact {
  const parsed = JSON.parse(value) as ConversationComparisonArtifact;
  assertSafeJson(parsed);
  if (
    parsed.artifactVersion !== 1 ||
    parsed.scenarioVersion !== CONVERSATION_SCENARIO_VERSION
  ) {
    throw new Error("Unsupported conversation comparison artifact version");
  }
  if (
    !Array.isArray(parsed.pairs) ||
    !Number.isFinite(parsed.totalJudgeCostUsd)
  ) {
    throw new Error("Invalid comparison payload");
  }
  if (!Number.isFinite(Date.parse(parsed.createdAt)))
    throw new Error("Invalid createdAt");
  return parsed;
}

const answerArtifactSchema = z.object({
  source: z.string().max(500).optional(),
  scenarioVersion: z.literal(CONVERSATION_SCENARIO_VERSION),
  replicas: z
    .array(
      z.object({
        scenarioId: z.string(),
        turnIndex: z.number().int().min(0),
        assistantText: z.string().trim().min(1),
      }),
    )
    .min(1),
});

const normalized = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it");

/** Inspect actual supplied response text; lexical checks are not a semantic judge. */
export function inspectConversationAnswers(value: unknown) {
  const artifact = answerArtifactSchema.parse(value);
  const results = artifact.replicas.map((replica) => {
    const scenario = CONVERSATIONAL_REALITY_SCENARIOS.find(
      (item) => item.id === replica.scenarioId,
    );
    const turn = scenario?.turns[replica.turnIndex];
    if (!turn)
      throw new Error(
        `Unknown scenario turn ${replica.scenarioId}#${replica.turnIndex}`,
      );
    const diagnostics = diagnoseConversationStructure(replica.assistantText);
    const expectations = turn.conversationalExpectations;
    const text = normalized(replica.assistantText);
    return {
      scenarioId: replica.scenarioId,
      turnIndex: replica.turnIndex,
      diagnostics,
      missingContextTerms:
        expectations?.expectedContextFacts?.filter(
          (fact) => !text.includes(normalized(fact)),
        ) ?? [],
      repeatedQuestionTerms: diagnostics.hasQuestion
        ? (expectations?.forbiddenRepeatedQuestions?.filter((question) =>
            text.includes(normalized(question)),
          ) ?? [])
        : [],
      questionPolicyMismatch:
        expectations?.questionPolicy === "none"
          ? diagnostics.hasQuestion
          : expectations?.questionPolicy === "diagnostic"
            ? !diagnostics.hasQuestion
            : false,
      exceedsWordGuide:
        turn.maxWords !== undefined && diagnostics.wordCount > turn.maxWords,
    };
  });
  return {
    mode: "supplied-answer-lexical-diagnostics",
    source: artifact.source ?? "supplied answer artifact",
    scenarioVersion: artifact.scenarioVersion,
    answerCount: results.length,
    semanticCoachingQuality: null,
    unsupportedMemoryClaimRate: null,
    judgeStatus: "not_run",
    limitations:
      "Exact terms and question punctuation are diagnostics only. Semantic relevance, grouped-question usefulness, safety and unsupported claims require the blinded judge or human review.",
    results,
  };
}

export function formatConversationComparisonReport(
  comparison: ConversationComparisonArtifact,
) {
  const safety =
    comparison.guardrailDeltas.safety < 0 ||
    comparison.pairs.some((pair) =>
      pair.safetyRegressions.some(
        (regression) => regression === "candidate" || regression === "both",
      ),
    )
      ? "BLOCKING REVIEW: safety regression detected."
      : "No safety regression detected.";
  const attentions = [
    Math.abs(comparison.guardrailDeltas.concisionPercent) > 5
      ? `ATTENTION: concision changed ${formatPercent(comparison.guardrailDeltas.concisionPercent)}.`
      : null,
    comparison.guardrailDeltas.latencyPercent > 5
      ? `ATTENTION: latency increased ${formatPercent(comparison.guardrailDeltas.latencyPercent)}.`
      : null,
  ].filter(Boolean);
  return [
    "# Conversational Quality Comparison",
    "",
    `- Baseline: ${comparison.baselineLabel} (${comparison.baselineCommit})`,
    `- Candidate: ${comparison.candidateLabel} (${comparison.candidateCommit})`,
    `- Model: ${comparison.modelId}`,
    `- Samples: ${comparison.samples}`,
    `- Judge cost: $${comparison.totalJudgeCostUsd.toFixed(6)}`,
    "",
    "## Decision Summary",
    "",
    safety,
    ...attentions,
    "This report is advisory; review scenario evidence case by case.",
    "",
    "## Pairwise Results",
    "",
    `| Baseline | Candidate | Tie | Both insufficient |\n| ---: | ---: | ---: | ---: |\n| ${comparison.verdictCounts.baseline} | ${comparison.verdictCounts.candidate} | ${comparison.verdictCounts.tie} | ${comparison.verdictCounts.both_insufficient} |`,
    "",
    "## Conversational Dimensions",
    "",
    dimensionTable(
      comparison.dimensionsBaseline,
      comparison.dimensionsCandidate,
    ),
    "",
    "## Guardrail Deltas",
    "",
    `- Safety: ${comparison.guardrailDeltas.safety.toFixed(2)}\n- Concision: ${formatPercent(comparison.guardrailDeltas.concisionPercent)}\n- Coaching usefulness: ${comparison.guardrailDeltas.coachingUsefulness.toFixed(2)}\n- Latency: ${formatPercent(comparison.guardrailDeltas.latencyPercent)}\n- Cost: ${formatPercent(comparison.guardrailDeltas.costPercent)}`,
    "",
    "## Structural Diagnostics",
    "",
    `- Baseline formula/list/question: ${comparison.structuralBaseline.acknowledgmentListQuestion}\n- Candidate formula/list/question: ${comparison.structuralCandidate.acknowledgmentListQuestion}\n- Baseline average words: ${comparison.structuralBaseline.wordCount.toFixed(1)}\n- Candidate average words: ${comparison.structuralCandidate.wordCount.toFixed(1)}`,
    "",
    "## Judge Disagreements",
    "",
    comparison.pairs
      .filter((pair) => pair.disagreement)
      .map((pair) => `- ${pair.key}`)
      .join("\n") || "None.",
    "",
    "## Scenario Review",
    "",
    ...comparison.pairs.flatMap((pair) => [
      `### ${pair.key}`,
      "",
      `Verdicts: ${pair.verdicts.join(", ")}`,
      "",
      `Reasons: ${pair.reasons.join(" | ")}`,
      "",
      "Baseline:",
      "",
      pair.baselineText,
      "",
      "Candidate:",
      "",
      pair.candidateText,
      "",
    ]),
  ].join("\n");
}

function dimensionTable(
  baseline: ConversationalDimensions,
  candidate: ConversationalDimensions,
) {
  return [
    "| Dimension | Baseline | Candidate | Delta |",
    "| --- | ---: | ---: | ---: |",
    ...Object.keys(baseline).map((key) => {
      const dimension = key as keyof ConversationalDimensions;
      return `| ${dimension} | ${baseline[dimension].toFixed(2)} | ${candidate[dimension].toFixed(2)} | ${(candidate[dimension] - baseline[dimension]).toFixed(2)} |`;
    }),
  ].join("\n");
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
