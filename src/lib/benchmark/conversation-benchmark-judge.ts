import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import { extractAIMetrics } from "@/lib/ai/cost-calculator";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import {
  CONVERSATION_SCENARIO_VERSION,
  type ConversationalDimensions,
  type ConversationVerdict,
} from "./conversation-benchmark";
import type { RealityScenario, RealityTranscriptMessage } from "./reality";

const dimensionsSchema = z
  .object({
    contextUse: z.number().min(0).max(10),
    conversationalNaturalness: z.number().min(0).max(10),
    discoveryBeforeAdvice: z.number().min(0).max(10),
    multiTurnProgression: z.number().min(0).max(10),
    questionQuality: z.number().min(0).max(10),
  })
  .strict();

export const ConversationPairwiseJudgeOutputSchema = z
  .object({
    preferred: z.enum(["A", "B", "tie", "both_insufficient"]),
    dimensionsA: dimensionsSchema,
    dimensionsB: dimensionsSchema,
    reason: z.string(),
    strengthsA: z.array(z.string()),
    strengthsB: z.array(z.string()),
    weaknessesA: z.array(z.string()),
    weaknessesB: z.array(z.string()),
    safetyRegression: z.enum(["A", "B", "neither", "both"]),
  })
  .strict();

export type ConversationPairwiseJudgeOutput = z.infer<
  typeof ConversationPairwiseJudgeOutputSchema
>;

export type BlindAssignment = {
  A: "baseline" | "candidate";
  B: "baseline" | "candidate";
};

export function assignBlindVariants(
  scenarioId: string,
  turnIndex: number,
  replicaId: string,
): BlindAssignment {
  const hash = createHash("sha256")
    .update(
      `${CONVERSATION_SCENARIO_VERSION}:${scenarioId}:${turnIndex}:${replicaId}`,
    )
    .digest();
  return (hash[0] ?? 0) & 1
    ? { A: "baseline", B: "candidate" }
    : { A: "candidate", B: "baseline" };
}

export function buildConversationPairwiseJudgePrompt({
  scenario,
  turnIndex,
  transcript,
  answerA,
  answerB,
}: {
  scenario: RealityScenario;
  turnIndex: number;
  transcript: RealityTranscriptMessage[];
  answerA: string;
  answerB: string;
}) {
  const turn = scenario.turns[turnIndex];
  if (!turn?.lowAnchorResponse || !turn.highAnchorResponse) {
    throw new Error(
      `Missing conversational anchors for ${scenario.id}#${turnIndex}`,
    );
  }
  return [
    "Confronta alla cieca due risposte italiane di coaching sportivo.",
    `Scenario: ${scenario.title}`,
    `Persona: ${scenario.persona}`,
    `Trascrizione: ${transcript.map((m) => `${m.role}: ${m.content}`).join("\n") || "(nessuna)"}`,
    `Turno utente: ${turn.userMessage}`,
    `Anchor debole: ${turn.lowAnchorResponse}`,
    `Anchor forte: ${turn.highAnchorResponse}`,
    `Rubrica: ${turn.judgeRubric}`,
    "Valuta 0-10: scoperta prima del consiglio, qualita della domanda, uso del contesto, naturalezza conversazionale, progressione multi-turn.",
    "Una domanda diagnostica cambia il consiglio; una domanda rituale mantiene soltanto aperta la chat. Non premiare la verbosita da sola.",
    `Risposta A:\n${answerA}`,
    `Risposta B:\n${answerB}`,
    "Scegli A, B, tie o both_insufficient e restituisci solo l'oggetto strutturato.",
  ].join("\n\n");
}

export type ConversationJudgeResult = {
  judgeModelId: string;
  output: ConversationPairwiseJudgeOutput;
  costUsd: number;
  generationTimeMs: number;
};

export async function judgeConversationPair({
  judgeModelId,
  scenario,
  turnIndex,
  transcript,
  answerA,
  answerB,
}: {
  judgeModelId: string;
  scenario: RealityScenario;
  turnIndex: number;
  transcript: RealityTranscriptMessage[];
  answerA: string;
  answerB: string;
}): Promise<ConversationJudgeResult> {
  const startedAt = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await generateText({
        model: openrouter(judgeModelId),
        output: Output.object({
          schema: ConversationPairwiseJudgeOutputSchema,
        }),
        instructions:
          "Sei un giudice severo di conversazioni di coaching. Non inferire l'identita delle varianti.",
        prompt: buildConversationPairwiseJudgePrompt({
          scenario,
          turnIndex,
          transcript,
          answerA,
          answerB,
        }),
        temperature: 0,
        abortSignal: controller.signal,
        providerOptions: {
          openrouter: getOpenRouterProviderOptionsForModel(judgeModelId),
        },
      });
      if (!result.output)
        throw new Error("Conversational judge returned no output");
      const metrics = extractAIMetrics(judgeModelId, startedAt, {
        text: "",
        usage: result.usage,
        providerMetadata: result.providerMetadata as Record<string, unknown>,
      });
      return {
        judgeModelId,
        output: result.output,
        costUsd: metrics.costUsd,
        generationTimeMs: metrics.generationTimeMs,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Conversational judge ${judgeModelId} failed`, {
    cause: lastError,
  });
}

export function revealVerdict(
  preferred: ConversationPairwiseJudgeOutput["preferred"],
  assignment: BlindAssignment,
): ConversationVerdict {
  if (preferred === "tie" || preferred === "both_insufficient")
    return preferred;
  return assignment[preferred];
}

export function dimensionsForVariant(
  output: ConversationPairwiseJudgeOutput,
  assignment: BlindAssignment,
  variant: "baseline" | "candidate",
): ConversationalDimensions {
  return assignment.A === variant ? output.dimensionsA : output.dimensionsB;
}
