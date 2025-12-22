/**
 * AI Judge
 *
 * Uses Gemini 2.5 Pro to evaluate benchmark results.
 */

import { generateObject } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { z } from "zod";
import type {
	TestCase,
	BenchmarkResultInput,
	JudgeScores,
	ToolUsageExpected,
	WritingQualityExpected,
} from "./types";

// Judge model - Gemini 2.5 Pro as requested
const JUDGE_MODEL = "google/gemini-2.5-pro-preview-06-05";

// Schemas for structured evaluation
const ToolUsageScoreSchema = z.object({
	score: z.number().min(0).max(10).describe("Punteggio da 0 a 10"),
	toolsUsedCorrectly: z
		.boolean()
		.describe("Se i tool corretti sono stati usati"),
	missingTools: z
		.array(z.string())
		.describe("Tool che dovevano essere usati ma non lo sono stati"),
	unexpectedTools: z
		.array(z.string())
		.describe("Tool usati ma non necessari"),
	fieldsCorrect: z
		.boolean()
		.describe("Se i campi passati ai tool sono corretti"),
	reasoning: z.string().describe("Spiegazione dettagliata del punteggio"),
});

const WritingQualityScoreSchema = z.object({
	score: z.number().min(0).max(10).describe("Punteggio da 0 a 10"),
	lengthAppropriate: z.boolean().describe("Se la lunghezza è appropriata"),
	toneMatches: z.boolean().describe("Se il tono è appropriato al contesto"),
	containsRequired: z.boolean().describe("Se contiene elementi richiesti"),
	avoidsProhibited: z.boolean().describe("Se evita elementi proibiti"),
	naturalFlow: z.boolean().describe("Se la risposta scorre naturalmente"),
	reasoning: z.string().describe("Spiegazione dettagliata del punteggio"),
});

/**
 * Evaluate a benchmark result using the AI judge.
 */
export async function evaluateResult(
	testCase: TestCase,
	result: BenchmarkResultInput
): Promise<JudgeScores> {
	const scores: JudgeScores = { overall: 0 };

	try {
		if (testCase.category === "tool_usage") {
			const toolScore = await evaluateToolUsage(testCase, result);
			scores.toolUsage = toolScore;
			scores.overall = toolScore.score;
		} else if (testCase.category === "writing_quality") {
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
 * Evaluate tool usage for a result.
 */
async function evaluateToolUsage(
	testCase: TestCase,
	result: BenchmarkResultInput
): Promise<{ score: number; reasoning: string }> {
	const expected = testCase.expectedBehavior as ToolUsageExpected;
	const toolsUsed = result.toolCalls?.map((t) => t.name) || [];

	const { object } = await generateObject({
		model: openrouter(JUDGE_MODEL),
		schema: ToolUsageScoreSchema,
		system: `Sei un valutatore esperto di sistemi AI. Il tuo compito è valutare se un modello AI ha usato correttamente i tool a sua disposizione.

Criteri di valutazione:
- 10: Tool perfetti - ha usato esattamente i tool giusti con i parametri corretti
- 8-9: Tool corretti - ha usato i tool giusti ma con piccole imperfezioni nei parametri
- 6-7: Parzialmente corretto - ha usato alcuni tool giusti ma ne mancano altri o ne ha usati di superflui
- 4-5: Problematico - ha sbagliato l'uso dei tool in modo significativo
- 2-3: Gravemente errato - ha completamente fallito nell'uso dei tool
- 0-1: Catastrofico - ha causato potenziali problemi con tool sbagliati

Considera:
1. Se doveva usare un tool e non l'ha fatto → penalità forte
2. Se non doveva usare tool e li ha usati → penalità moderata
3. Se i parametri dei tool sono sbagliati → penalità proporzionale
4. Se ha usato tool vietati → penalità forte`,
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

Valuta da 0 a 10 con spiegazione dettagliata.`,
	});

	return {
		score: object.score,
		reasoning: object.reasoning,
	};
}

/**
 * Evaluate writing quality for a result.
 */
async function evaluateWritingQuality(
	testCase: TestCase,
	result: BenchmarkResultInput
): Promise<{ score: number; reasoning: string }> {
	const expected = testCase.expectedBehavior as WritingQualityExpected;
	const responseLength = result.responseText.length;

	// Pre-check some conditions
	const lengthCheck = {
		tooShort: expected.minLength
			? responseLength < expected.minLength
			: false,
		tooLong: expected.maxLength
			? responseLength > expected.maxLength
			: false,
	};

	const containsCheck = {
		missing:
			expected.mustContain?.filter(
				(s) =>
					!result.responseText.toLowerCase().includes(s.toLowerCase())
			) || [],
		prohibited:
			expected.mustNotContain?.filter((s) =>
				result.responseText.toLowerCase().includes(s.toLowerCase())
			) || [],
	};

	const { object } = await generateObject({
		model: openrouter(JUDGE_MODEL),
		schema: WritingQualityScoreSchema,
		system: `Sei un valutatore esperto di comunicazione AI. Il tuo compito è valutare la qualità della scrittura di un assistente AI.

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
7. Personalizzazione: usa il contesto dell'utente appropriatamente (nome, sport, obiettivi, memorie)`,
		prompt: `## Test Case: ${testCase.name}
Descrizione: ${testCase.description}

## Contesto Utente
- Profilo: ${JSON.stringify(testCase.setup.userContext.profile || {})}
- Preferenze: ${JSON.stringify(testCase.setup.userContext.preferences || {})}
- Memorie: ${
			testCase.setup.memories
				.map((m) => `${m.key}: ${m.value}`)
				.join(", ") || "Nessuna"
		}

## Cronologia
${
	testCase.setup.session.length > 0
		? testCase.setup.session
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

Valuta da 0 a 10 con spiegazione dettagliata.`,
	});

	return {
		score: object.score,
		reasoning: object.reasoning,
	};
}

/**
 * Re-evaluate all results in a run (useful after fixing issues).
 */
export async function reEvaluateRun(runId: string): Promise<void> {
	const { prisma } = await import("@/lib/db");
	const { readFileSync } = await import("fs");
	const { join } = await import("path");

	const datasetPath = join(process.cwd(), "src/lib/benchmark/dataset.json");
	const datasetData = readFileSync(datasetPath, "utf-8");
	const dataset = JSON.parse(datasetData) as {
		testCases: Array<{ id: string; category: string }>;
	};

	const results = await prisma.benchmarkResult.findMany({
		where: { runId },
	});

	for (const result of results) {
		const testCase = dataset.testCases.find(
			(tc) => tc.id === result.testCaseId
		);
		if (!testCase) continue;

		const resultInput: BenchmarkResultInput = {
			testCaseId: result.testCaseId,
			category: result.category,
			modelId: result.modelId,
			inferenceTimeMs: result.inferenceTimeMs,
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

		const scores = await evaluateResult(testCase as TestCase, resultInput);

		await prisma.benchmarkResult.update({
			where: { id: result.id },
			data: {
				toolUsageScore: scores.toolUsage?.score,
				toolUsageReasoning: scores.toolUsage?.reasoning,
				writingQualityScore: scores.writingQuality?.score,
				writingQualityReasoning: scores.writingQuality?.reasoning,
				overallScore: scores.overall,
			},
		});

		console.log(`Re-evaluated ${result.testCaseId}: ${scores.overall}/10`);
	}
}
