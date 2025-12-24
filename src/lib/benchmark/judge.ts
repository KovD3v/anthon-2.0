/**
 * AI Judge
 *
 * Uses Gemini 2.5 Pro to evaluate benchmark results.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";
import type {
  BenchmarkResultInput,
  JudgeScores,
  TestCase,
  TestCaseSetup,
  ToolUsageCritique,
  ToolUsageExpected,
  WritingQualityCritique,
  WritingQualityExpected,
} from "./types";

// Judge models for multi-judge consensus
const JUDGE_MODEL = "x-ai/grok-4-fast";
const JUDGE_MODEL_2 = "google/gemini-3-flash-preview"; // Second judge for consensus

// Disagreement threshold for flagging results
const DISAGREEMENT_THRESHOLD = 3;

// Critique schemas for Chain of Thought evaluation
const ToolUsageCritiqueSchema = z.object({
  toolsAnalysis: z
    .string()
    .describe(
      "Analisi dettagliata dei tool usati: quali sono stati chiamati, in che ordine, con quali parametri",
    ),
  parametersCheck: z
    .string()
    .describe(
      "Verifica dei parametri passati ai tool: sono corretti? Mancano campi? Valori sbagliati?",
    ),
  missingElements: z
    .string()
    .describe(
      "Elementi mancanti: quali tool dovevano essere chiamati ma non lo sono stati? Quali dati non sono stati salvati?",
    ),
  unexpectedBehaviors: z
    .string()
    .describe(
      "Comportamenti inattesi: tool chiamati quando non dovevano, parametri extra, azioni non richieste",
    ),
});

// Schemas for structured evaluation (Chain of Thought: Critique → Evaluation → Score)
const ToolUsageScoreSchema = z.object({
  // Step 1: Detailed critique (REQUIRED FIRST - Chain of Thought)
  critique: ToolUsageCritiqueSchema.describe(
    "Critica dettagliata PRIMA di assegnare un punteggio",
  ),

  // Step 2: Structured evaluation based on critique
  toolsUsedCorrectly: z
    .boolean()
    .describe("Se i tool corretti sono stati usati"),
  missingTools: z
    .array(z.string())
    .describe("Tool che dovevano essere usati ma non lo sono stati"),
  unexpectedTools: z.array(z.string()).describe("Tool usati ma non necessari"),
  fieldsCorrect: z
    .boolean()
    .describe("Se i campi passati ai tool sono corretti"),

  // Step 3: Final score with reasoning based on critique (LAST)
  score: z
    .number()
    .min(0)
    .max(10)
    .describe("Punteggio da 0 a 10 basato sulla critica"),
  reasoning: z
    .string()
    .describe(
      "Conclusione finale che riassume la critica e giustifica il punteggio",
    ),
});

// Critique schema for writing quality Chain of Thought evaluation
const WritingQualityCritiqueSchema = z.object({
  contentAnalysis: z
    .string()
    .describe(
      "Analisi del contenuto: la risposta affronta la richiesta? È pertinente? Fornisce valore?",
    ),
  toneAnalysis: z
    .string()
    .describe(
      "Analisi del tono: è appropriato al contesto? Rispetta le preferenze dell'utente? È empatico quando serve?",
    ),
  structureAnalysis: z
    .string()
    .describe(
      "Analisi della struttura: lunghezza appropriata? Formattazione corretta? Flusso naturale?",
    ),
  complianceCheck: z
    .string()
    .describe(
      "Verifica conformità: contiene gli elementi richiesti? Evita quelli proibiti? Usa il contesto utente?",
    ),
});

const WritingQualityScoreSchema = z.object({
  // Step 1: Detailed critique (REQUIRED FIRST - Chain of Thought)
  critique: WritingQualityCritiqueSchema.describe(
    "Critica dettagliata PRIMA di assegnare un punteggio",
  ),

  // Step 2: Structured evaluation based on critique
  lengthAppropriate: z.boolean().describe("Se la lunghezza è appropriata"),
  toneMatches: z.boolean().describe("Se il tono è appropriato al contesto"),
  containsRequired: z.boolean().describe("Se contiene elementi richiesti"),
  avoidsProhibited: z.boolean().describe("Se evita elementi proibiti"),
  naturalFlow: z.boolean().describe("Se la risposta scorre naturalmente"),

  // Step 3: Final score with reasoning based on critique (LAST)
  score: z
    .number()
    .min(0)
    .max(10)
    .describe("Punteggio da 0 a 10 basato sulla critica"),
  reasoning: z
    .string()
    .describe(
      "Conclusione finale che riassume la critica e giustifica il punteggio",
    ),
});

/**
 * Evaluate a benchmark result using the AI judge.
 */
export async function evaluateResult(
  testCase: TestCase,
  result: BenchmarkResultInput,
): Promise<JudgeScores> {
  const scores: JudgeScores = { overall: 0 };

  try {
    if (testCase.category === "TOOL_USAGE") {
      const toolScore = await evaluateToolUsage(testCase, result);
      scores.toolUsage = toolScore;
      scores.overall = toolScore.score;
    } else if (testCase.category === "WRITING_QUALITY") {
      const writingScore = await evaluateWritingQuality(testCase, result);
      scores.writingQuality = writingScore;
      scores.overall = writingScore.score;
    }
  } catch (error) {
    console.error("[Judge] Evaluation error:", error);
    scores.overall = 0;
  }

  return scores;
}

/**
 * Evaluate a benchmark result using two AI judges and calculate consensus.
 * Runs both judges in parallel for efficiency.
 */
export async function evaluateResultWithConsensus(
  testCase: TestCase,
  result: BenchmarkResultInput,
): Promise<{
  judge1: JudgeScores;
  judge2: JudgeScores;
  consensusScore: number;
  judgeDisagreement: number;
  flaggedForReview: boolean;
}> {
  // Run both judges in parallel
  const [judge1Scores, judge2Scores] = await Promise.all([
    evaluateWithModel(testCase, result, JUDGE_MODEL),
    evaluateWithModel(testCase, result, JUDGE_MODEL_2),
  ]);

  // Calculate consensus metrics
  const consensusScore = (judge1Scores.overall + judge2Scores.overall) / 2;
  const judgeDisagreement = Math.abs(
    judge1Scores.overall - judge2Scores.overall,
  );
  const flaggedForReview = judgeDisagreement > DISAGREEMENT_THRESHOLD;

  if (flaggedForReview) {
    console.log(
      `⚠️ [Judge] Significant disagreement for ${result.testCaseId}: ` +
        `Judge1=${judge1Scores.overall.toFixed(
          1,
        )}, Judge2=${judge2Scores.overall.toFixed(1)} ` +
        `(diff=${judgeDisagreement.toFixed(1)})`,
    );
  }

  return {
    judge1: judge1Scores,
    judge2: judge2Scores,
    consensusScore,
    judgeDisagreement,
    flaggedForReview,
  };
}

/**
 * Internal helper: Evaluate with a specific model.
 */
async function evaluateWithModel(
  testCase: TestCase,
  result: BenchmarkResultInput,
  modelId: string,
): Promise<JudgeScores> {
  const scores: JudgeScores = { overall: 0 };

  try {
    if (testCase.category === "TOOL_USAGE") {
      const toolScore = await evaluateToolUsageWithModel(
        testCase,
        result,
        modelId,
      );
      scores.toolUsage = toolScore;
      scores.overall = toolScore.score;
    } else if (testCase.category === "WRITING_QUALITY") {
      const writingScore = await evaluateWritingQualityWithModel(
        testCase,
        result,
        modelId,
      );
      scores.writingQuality = writingScore;
      scores.overall = writingScore.score;
    }
  } catch (error) {
    console.error(`[Judge] Evaluation error with ${modelId}:`, error);
    scores.overall = 0;
  }

  return scores;
}

/**
 * Evaluate tool usage for a result.
 */
async function evaluateToolUsage(
  testCase: TestCase,
  result: BenchmarkResultInput,
): Promise<{ score: number; reasoning: string; critique?: ToolUsageCritique }> {
  const expected = testCase.expectedBehavior as unknown as ToolUsageExpected;
  const toolsUsed = result.toolCalls?.map((t) => t.name) || [];

  const { object } = await generateObject({
    model: openrouter(JUDGE_MODEL),
    schema: ToolUsageScoreSchema,
    system: `Sei un valutatore esperto di sistemi AI. Il tuo compito è valutare se un modello AI ha usato correttamente i tool a sua disposizione.

IMPORTANTE: Segui il processo CHAIN OF THOUGHT - ragiona passo per passo:
1. PRIMA scrivi una critica dettagliata analizzando ogni aspetto
2. POI compila i campi di valutazione strutturati
3. INFINE assegna il punteggio basato sulla critica

Criteri di valutazione:
- 10: Tool perfetti - ha usato esattamente i tool giusti con i parametri corretti (valori attesi, tipi corretti, campi obbligatori presenti)
- 8-9: Tool corretti - ha usato i tool giusti ma con piccole imperfezioni formali nei parametri che non ne compromettono l'esecuzione
- 6-7: Parzialmente corretto - ha usato alcuni tool giusti ma ne mancano altri importanti, oppure ha usato i tool giusti ma con PARAMETRI COMPLETAMENTE SBAGLIATI o valori placeholder
- 4-5: Problematico - ha sbagliato l'uso dei tool in modo significativo (tool errati, parametri mancanti critici)
- 2-3: Gravemente errato - ha completamente fallito nell'uso dei tool necessari
- 0-1: Catastrofico - ha causato potenziali problemi chiamando tool pericolosi o sprecando risorse

Considera:
1. Se doveva usare un tool e non l'ha fatto → penalità forte
2. Se non doveva usare tool e li ha usati → penalità moderata
3. Se i parametri dei tool sono sbagliati (es. "placeholder", campi mancanti, valori incoerenti) → PENALITÀ FORTE
4. Se ha usato tool vietati → penalità forte

RICORDA: La critica deve venire PRIMA del punteggio. Non anticipare il punteggio nella critica. Sii molto severo sui parametri dei tool.`,
    prompt: `## Test Case: ${testCase.name}
Descrizione: ${testCase.description}

## Messaggio Utente
"${testCase.userMessage}"

## Aspettative
- Doveva usare tool: ${expected.shouldUseTool ? "SÌ" : "NO"}
- Tool attesi: ${expected.expectedTools?.join(", ") || "Nessuno specifico"}
- Tool vietati: ${expected.forbiddenTools?.join(", ") || "Nessuno"}
- Campi attesi: ${JSON.stringify(expected.expectedFields || {})}

## Risultato Effettivo
- Tool usati: ${toolsUsed.length > 0 ? toolsUsed.join(", ") : "NESSUNO"}
- Dettaglio chiamate: ${JSON.stringify(result.toolCalls, null, 2)}

## Risposta AI
"${result.responseText.slice(0, 1000)}${
      result.responseText.length > 1000 ? "..." : ""
    }"

ISTRUZIONI:
1. Scrivi PRIMA la critica dettagliata nei 4 campi (toolsAnalysis, parametersCheck, missingElements, unexpectedBehaviors)
2. Compila i campi di valutazione (toolsUsedCorrectly, missingTools, unexpectedTools, fieldsCorrect)
3. Solo DOPO assegna il punteggio e scrivi il reasoning finale`,
  });

  return {
    score: object.score,
    reasoning: object.reasoning,
    critique: object.critique,
  };
}

/**
 * Evaluate writing quality for a result.
 */
async function evaluateWritingQuality(
  testCase: TestCase,
  result: BenchmarkResultInput,
): Promise<{
  score: number;
  reasoning: string;
  critique?: WritingQualityCritique;
}> {
  const expected =
    testCase.expectedBehavior as unknown as WritingQualityExpected;
  const responseLength = result.responseText.length;

  // Pre-check some conditions
  const lengthCheck = {
    tooShort: expected.minLength ? responseLength < expected.minLength : false,
    tooLong: expected.maxLength ? responseLength > expected.maxLength : false,
  };

  const containsCheck = {
    missing:
      expected.mustContain?.filter(
        (s) => !result.responseText.toLowerCase().includes(s.toLowerCase()),
      ) || [],
    prohibited:
      expected.mustNotContain?.filter((s) =>
        result.responseText.toLowerCase().includes(s.toLowerCase()),
      ) || [],
  };

  const { object } = await generateObject({
    model: openrouter(JUDGE_MODEL),
    schema: WritingQualityScoreSchema,
    system: `Sei un valutatore esperto di comunicazione AI. Il tuo compito è valutare la qualità della scrittura di un assistente AI.

IMPORTANTE: Segui il processo CHAIN OF THOUGHT - ragiona passo per passo:
1. PRIMA scrivi una critica dettagliata analizzando ogni aspetto
2. POI compila i campi di valutazione strutturati
3. INFINE assegna il punteggio basato sulla critica

Criteri di valutazione:
- 10: Eccellente - risposta perfetta, tono giusto, lunghezza appropriata, contenuto rilevante
- 8-9: Ottimo - risposta molto buona con solo piccole imperfezioni
- 6-7: Buono - risposta adeguata ma con margini di miglioramento
- 4-5: Sufficiente - risposta accettabile ma con problemi evidenti
- 2-3: Insufficiente - risposta problematica
- 0-1: Inaccettabile - risposta completamente sbagliata

CRITERI OBBLIGATORI (valuta sempre):
1. SINTASSI E ORTOGRAFIA: La risposta deve essere in italiano corretto, senza errori grammaticali o ortografici. Penalizza errori evidenti.
2. PUNTEGGIATURA: Uso corretto di virgole, punti, maiuscole.

Criteri contestuali:
3. Lunghezza: breve per messaggi brevi, elaborata per domande complesse
4. Tono: empatico per frustrazione, tecnico quando richiesto
5. Contenuto: include elementi richiesti, evita quelli proibiti
6. Naturalezza: la risposta scorre bene, non è robotica
7. Personalizzazione: usa il contesto dell'utente appropriatamente (nome, sport, obiettivi, memorie)

RICORDA: La critica deve venire PRIMA del punteggio. Non anticipare il punteggio nella critica.`,
    prompt: `## Test Case: ${testCase.name}
Descrizione: ${testCase.description}

## Contesto Utente
- Profilo: ${JSON.stringify(
      (testCase.setup as unknown as TestCaseSetup).userContext?.profile || {},
    )}
- Preferenze: ${JSON.stringify(
      (testCase.setup as unknown as TestCaseSetup).userContext?.preferences ||
        {},
    )}
- Memorie: ${
      (testCase.setup as unknown as TestCaseSetup).memories
        ?.map((m) => `${m.key}: ${m.value}`)
        .join(", ") || "Nessuna"
    }

## Cronologia
${
  (testCase.setup as unknown as TestCaseSetup).session?.length > 0
    ? (testCase.setup as unknown as TestCaseSetup).session
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
    : "Prima interazione"
}

## Messaggio Utente
"${testCase.userMessage}"

## Aspettative
- Dovrebbe essere breve: ${expected.shouldBeShort ?? "N/A"}
- Lunghezza min: ${expected.minLength ?? "N/A"} caratteri
- Lunghezza max: ${expected.maxLength ?? "N/A"} caratteri
- Tono atteso: ${expected.expectedTone ?? "default"}
- Deve menzionare nome: ${expected.shouldMentionName ?? "N/A"}
- Deve contenere: ${expected.mustContain?.join(", ") || "N/A"}
- NON deve contenere: ${expected.mustNotContain?.join(", ") || "N/A"}

## Risposta AI (${responseLength} caratteri)
"${result.responseText}"

## Check Automatici
- Troppo corta: ${lengthCheck.tooShort}
- Troppo lunga: ${lengthCheck.tooLong}
- Elementi mancanti: ${containsCheck.missing.join(", ") || "Nessuno"}
- Elementi proibiti trovati: ${containsCheck.prohibited.join(", ") || "Nessuno"}

ISTRUZIONI:
1. Scrivi PRIMA la critica dettagliata nei 4 campi (contentAnalysis, toneAnalysis, structureAnalysis, complianceCheck)
2. Compila i campi di valutazione (lengthAppropriate, toneMatches, containsRequired, avoidsProhibited, naturalFlow)
3. Solo DOPO assegna il punteggio e scrivi il reasoning finale`,
  });

  return {
    score: object.score,
    reasoning: object.reasoning,
    critique: object.critique,
  };
}

/**
 * Evaluate tool usage with a specific model (for multi-judge consensus).
 */
async function evaluateToolUsageWithModel(
  testCase: TestCase,
  result: BenchmarkResultInput,
  modelId: string,
): Promise<{ score: number; reasoning: string; critique?: ToolUsageCritique }> {
  const expected = testCase.expectedBehavior as unknown as ToolUsageExpected;
  const toolsUsed = result.toolCalls?.map((t) => t.name) || [];

  const { object } = await generateObject({
    model: openrouter(modelId),
    schema: ToolUsageScoreSchema,
    system: `Sei un valutatore esperto di sistemi AI. Il tuo compito è valutare se un modello AI ha usato correttamente i tool a sua disposizione.

IMPORTANTE: Segui il processo CHAIN OF THOUGHT - ragiona passo per passo:
1. PRIMA scrivi una critica dettagliata analizzando ogni aspetto
2. POI compila i campi di valutazione strutturati
3. INFINE assegna il punteggio basato sulla critica

Criteri di valutazione:
- 10: Tool perfetti - ha usato esattamente i tool giusti con i parametri corretti (valori attesi, tipi corretti, campi obbligatori presenti)
- 8-9: Tool corretti - ha usato i tool giusti ma con piccole imperfezioni formali nei parametri che non ne compromettono l'esecuzione
- 6-7: Parzialmente corretto - ha usato alcuni tool giusti ma ne mancano altri importanti, oppure ha usato i tool giusti ma con PARAMETRI COMPLETAMENTE SBAGLIATI o valori placeholder
- 4-5: Problematico - ha sbagliato l'uso dei tool in modo significativo (tool errati, parametri mancanti critici)
- 2-3: Gravemente errato - ha completamente fallito nell'uso dei tool necessari
- 0-1: Catastrofico - ha causato potenziali problemi chiamando tool pericolosi o sprecando risorse

Considera:
1. Se doveva usare un tool e non l'ha fatto → penalità forte
2. Se non doveva usare tool e li ha usati → penalità moderata
3. Se i parametri dei tool sono sbagliati (es. "placeholder", campi mancanti, valori incoerenti) → PENALITÀ FORTE
4. Se ha usato tool vietati → penalità forte

RICORDA: La critica deve venire PRIMA del punteggio. Non anticipare il punteggio nella critica. Sii molto severo sui parametri dei tool.`,
    prompt: `## Test Case: ${testCase.name}
Descrizione: ${testCase.description}

## Messaggio Utente
"${testCase.userMessage}"

## Aspettative
- Doveva usare tool: ${expected.shouldUseTool ? "SÌ" : "NO"}
- Tool attesi: ${expected.expectedTools?.join(", ") || "Nessuno specifico"}
- Tool vietati: ${expected.forbiddenTools?.join(", ") || "Nessuno"}
- Campi attesi: ${JSON.stringify(expected.expectedFields || {})}

## Risultato Effettivo
- Tool usati: ${toolsUsed.length > 0 ? toolsUsed.join(", ") : "NESSUNO"}
- Dettaglio chiamate: ${JSON.stringify(result.toolCalls, null, 2)}

## Risposta AI
"${result.responseText.slice(0, 1000)}${
      result.responseText.length > 1000 ? "..." : ""
    }"

ISTRUZIONI:
1. Scrivi PRIMA la critica dettagliata nei 4 campi (toolsAnalysis, parametersCheck, missingElements, unexpectedBehaviors)
2. Compila i campi di valutazione (toolsUsedCorrectly, missingTools, unexpectedTools, fieldsCorrect)
3. Solo DOPO assegna il punteggio e scrivi il reasoning finale`,
  });

  return {
    score: object.score,
    reasoning: object.reasoning,
    critique: object.critique,
  };
}

/**
 * Evaluate writing quality with a specific model (for multi-judge consensus).
 */
async function evaluateWritingQualityWithModel(
  testCase: TestCase,
  result: BenchmarkResultInput,
  modelId: string,
): Promise<{
  score: number;
  reasoning: string;
  critique?: WritingQualityCritique;
}> {
  const expected =
    testCase.expectedBehavior as unknown as WritingQualityExpected;
  const responseLength = result.responseText.length;

  const lengthCheck = {
    tooShort: expected.minLength ? responseLength < expected.minLength : false,
    tooLong: expected.maxLength ? responseLength > expected.maxLength : false,
  };

  const containsCheck = {
    missing:
      expected.mustContain?.filter(
        (s) => !result.responseText.toLowerCase().includes(s.toLowerCase()),
      ) || [],
    prohibited:
      expected.mustNotContain?.filter((s) =>
        result.responseText.toLowerCase().includes(s.toLowerCase()),
      ) || [],
  };

  const { object } = await generateObject({
    model: openrouter(modelId),
    schema: WritingQualityScoreSchema,
    system: `Sei un valutatore esperto di comunicazione AI. Il tuo compito è valutare la qualità della scrittura di un assistente AI.

IMPORTANTE: Segui il processo CHAIN OF THOUGHT - ragiona passo per passo:
1. PRIMA scrivi una critica dettagliata analizzando ogni aspetto
2. POI compila i campi di valutazione strutturati
3. INFINE assegna il punteggio basato sulla critica

Criteri di valutazione:
- 10: Eccellente - risposta perfetta, tono giusto, lunghezza appropriata, contenuto rilevante
- 8-9: Ottimo - risposta molto buona con solo piccole imperfezioni
- 6-7: Buono - risposta adeguata ma con margini di miglioramento
- 4-5: Sufficiente - risposta accettabile ma con problemi evidenti
- 2-3: Insufficiente - risposta problematica
- 0-1: Inaccettabile - risposta completamente sbagliata

CRITERI OBBLIGATORI (valuta sempre):
1. SINTASSI E ORTOGRAFIA: La risposta deve essere in italiano corretto, senza errori grammaticali o ortografici. Penalizza errori evidenti.
2. PUNTEGGIATURA: Uso corretto di virgole, punti, maiuscole.

Criteri contestuali:
3. Lunghezza: breve per messaggi brevi, elaborata per domande complesse
4. Tono: empatico per frustrazione, tecnico quando richiesto
5. Contenuto: include elementi richiesti, evita quelli proibiti
6. Naturalezza: la risposta scorre bene, non è robotica
7. Personalizzazione: usa il contesto dell'utente appropriatamente (nome, sport, obiettivi, memorie)

RICORDA: La critica deve venire PRIMA del punteggio. Non anticipare il punteggio nella critica.`,
    prompt: `## Test Case: ${testCase.name}
Descrizione: ${testCase.description}

## Contesto Utente
- Profilo: ${JSON.stringify(
      (testCase.setup as unknown as TestCaseSetup).userContext?.profile || {},
    )}
- Preferenze: ${JSON.stringify(
      (testCase.setup as unknown as TestCaseSetup).userContext?.preferences ||
        {},
    )}
- Memorie: ${
      (testCase.setup as unknown as TestCaseSetup).memories
        ?.map((m) => `${m.key}: ${m.value}`)
        .join(", ") || "Nessuna"
    }

## Cronologia
${
  (testCase.setup as unknown as TestCaseSetup).session?.length > 0
    ? (testCase.setup as unknown as TestCaseSetup).session
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
    : "Prima interazione"
}

## Messaggio Utente
"${testCase.userMessage}"

## Aspettative
- Dovrebbe essere breve: ${expected.shouldBeShort ?? "N/A"}
- Lunghezza min: ${expected.minLength ?? "N/A"} caratteri
- Lunghezza max: ${expected.maxLength ?? "N/A"} caratteri
- Tono atteso: ${expected.expectedTone ?? "default"}
- Deve menzionare nome: ${expected.shouldMentionName ?? "N/A"}
- Deve contenere: ${expected.mustContain?.join(", ") || "N/A"}
- NON deve contenere: ${expected.mustNotContain?.join(", ") || "N/A"}

## Risposta AI (${responseLength} caratteri)
"${result.responseText}"

## Check Automatici
- Troppo corta: ${lengthCheck.tooShort}
- Troppo lunga: ${lengthCheck.tooLong}
- Elementi mancanti: ${containsCheck.missing.join(", ") || "Nessuno"}
- Elementi proibiti trovati: ${containsCheck.prohibited.join(", ") || "Nessuno"}

ISTRUZIONI:
1. Scrivi PRIMA la critica dettagliata nei 4 campi (contentAnalysis, toneAnalysis, structureAnalysis, complianceCheck)
2. Compila i campi di valutazione (lengthAppropriate, toneMatches, containsRequired, avoidsProhibited, naturalFlow)
3. Solo DOPO assegna il punteggio e scrivi il reasoning finale`,
  });

  return {
    score: object.score,
    reasoning: object.reasoning,
    critique: object.critique,
  };
}

/**
 * Re-evaluate all results in a run (useful after fixing issues).
 */
export async function reEvaluateRun(runId: string): Promise<void> {
  const results = await prisma.benchmarkResult.findMany({
    where: { runId },
  });

  const testCases = await prisma.benchmarkTestCase.findMany({
    where: { isActive: true },
  });

  for (const result of results) {
    const testCase = testCases.find(
      (tc) =>
        tc.id === result.testCaseId || tc.externalId === result.testCaseId,
    );
    if (!testCase) continue;

    const resultInput: BenchmarkResultInput = {
      testCaseId: result.testCaseId,
      category: result.category,
      modelId: result.modelId,
      inferenceTimeMs: result.inferenceTimeMs,
      ttftMs: result.ttftMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      reasoningTokens: result.reasoningTokens,
      costUsd: result.costUsd,
      responseText: result.responseText,
      toolCalls: result.toolCalls as Array<{
        name: string;
        args: unknown;
        result?: unknown;
      }> | null,
      sessionUsed: (result.sessionUsed as {
        messageCount: number;
        sessions: number;
      }) || {
        messageCount: 0,
        sessions: 0,
      },
      memoriesUsed: result.memoriesUsed,
    };

    const consensus = await evaluateResultWithConsensus(
      testCase as TestCase,
      resultInput,
    );
    const {
      judge1,
      judge2,
      consensusScore,
      judgeDisagreement,
      flaggedForReview,
    } = consensus;

    await prisma.benchmarkResult.update({
      where: { id: result.id },
      data: {
        // Judge 1 scores
        toolUsageScore: judge1.toolUsage?.score,
        toolUsageReasoning: judge1.toolUsage?.reasoning,
        toolUsageCritique: judge1.toolUsage?.critique ?? undefined,
        writingQualityScore: judge1.writingQuality?.score,
        writingQualityReasoning: judge1.writingQuality?.reasoning,
        writingQualityCritique: judge1.writingQuality?.critique ?? undefined,
        overallScore: judge1.overall,
        // Judge 2 scores
        judge2ToolUsageScore: judge2.toolUsage?.score,
        judge2ToolUsageReasoning: judge2.toolUsage?.reasoning,
        judge2ToolUsageCritique: judge2.toolUsage?.critique ?? undefined,
        judge2WritingQualityScore: judge2.writingQuality?.score,
        judge2WritingQualityReasoning: judge2.writingQuality?.reasoning,
        judge2WritingQualityCritique:
          judge2.writingQuality?.critique ?? undefined,
        judge2OverallScore: judge2.overall,
        // Consensus metrics
        consensusScore,
        judgeDisagreement,
        flaggedForReview,
      },
    });

    console.log(
      `Re-evaluated ${
        result.testCaseId
      }: consensus=${consensusScore.toFixed(1)} (J1=${
        judge1.overall
      }, J2=${judge2.overall})`,
    );
  }
}
