/**
 * Benchmark Runner
 *
 * Executes benchmark test cases against multiple AI models and collects metrics.
 */

import { streamText, type ModelMessage, stepCountIs } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";
import type {
	TestCase,
	BenchmarkDataset,
	BenchmarkRunnerOptions,
	BenchmarkResultInput,
} from "./types";
import { evaluateResult } from "./judge";
import { readFileSync } from "fs";
import { join } from "path";

// Load dataset from JSON file
function loadDataset(): BenchmarkDataset {
	const datasetPath = join(process.cwd(), "src/lib/benchmark/dataset.json");
	const data = readFileSync(datasetPath, "utf-8");
	return JSON.parse(data) as BenchmarkDataset;
}

// Enum values (hardcoded to avoid import issues before migration)
const BenchmarkStatus = {
	PENDING: "PENDING",
	RUNNING: "RUNNING",
	COMPLETED: "COMPLETED",
	FAILED: "FAILED",
} as const;

const BenchmarkCategory = {
	TOOL_USAGE: "TOOL_USAGE",
	WRITING_QUALITY: "WRITING_QUALITY",
} as const;

// Models to benchmark (current production models)
const DEFAULT_MODELS = [
	"google/gemini-2.0-flash-lite-001",
	"google/gemini-2.0-flash-001",
	"google/gemini-2.5-flash-lite-preview-09-2025",
] as const;

// Mock user ID for benchmark runs
const BENCHMARK_USER_ID = "benchmark-user-000";

/**
 * Run a complete benchmark with all test cases and models.
 */
export async function runBenchmark(
	options: BenchmarkRunnerOptions = {}
): Promise<string> {
	const models = options.models || [...DEFAULT_MODELS];
	const runName =
		options.runName ||
		`Benchmark ${new Date().toLocaleDateString("it-IT", {
			day: "2-digit",
			month: "short",
			year: "numeric",
		})}`;

	// Create benchmark run record
	const run = await prisma.benchmarkRun.create({
		data: {
			name: runName,
			description: options.description,
			models,
			status: BenchmarkStatus.RUNNING,
			startedAt: new Date(),
		},
	});

	console.log(`🚀 Starting benchmark run: ${run.id}`);
	console.log(`📊 Models: ${models.join(", ")}`);

	try {
		// Load and filter test cases
		const datasetData = loadDataset();
		const allTestCases = datasetData.testCases as TestCase[];
		let testCases = allTestCases;

		if (options.testCaseIds?.length) {
			testCases = allTestCases.filter((tc) =>
				options.testCaseIds!.includes(tc.id)
			);
		}
		if (options.categories?.length) {
			testCases = testCases.filter((tc) =>
				options.categories!.includes(tc.category)
			);
		}

		console.log(`📝 Test cases: ${testCases.length}`);

		// Build list of all test runs (testCase + model combinations)
		const testRuns: Array<{ testCase: TestCase; modelId: string }> = [];
		for (const testCase of testCases) {
			for (const modelId of models) {
				testRuns.push({ testCase, modelId });
			}
		}

		console.log(`🔄 Total runs: ${testRuns.length} (parallel execution)`);

		// Run tests in parallel with concurrency limit
		const CONCURRENCY = 10; // Max parallel API calls
		const chunks: Array<Array<{ testCase: TestCase; modelId: string }>> =
			[];
		for (let i = 0; i < testRuns.length; i += CONCURRENCY) {
			chunks.push(testRuns.slice(i, i + CONCURRENCY));
		}

		let completed = 0;
		for (const chunk of chunks) {
			await Promise.all(
				chunk.map(async ({ testCase, modelId }) => {
					console.log(
						`🧪 Running: ${testCase.id} with ${
							modelId.split("/")[1]
						}`
					);

					try {
						// Execute test
						const result = await runSingleTest(testCase, modelId);

						// Evaluate with AI judge
						const scores = await evaluateResult(testCase, result);

						// Save to database
						await prisma.benchmarkResult.create({
							data: {
								runId: run.id,
								testCaseId: result.testCaseId,
								category: result.category,
								modelId: result.modelId,
								inferenceTimeMs: result.inferenceTimeMs,
								inputTokens: result.inputTokens,
								outputTokens: result.outputTokens,
								reasoningTokens: result.reasoningTokens,
								costUsd: result.costUsd,
								responseText: result.responseText,
								toolCalls: result.toolCalls ?? undefined,
								sessionUsed: result.sessionUsed,
								memoriesUsed: result.memoriesUsed,
								toolUsageScore: scores.toolUsage?.score,
								toolUsageReasoning: scores.toolUsage?.reasoning,
								writingQualityScore:
									scores.writingQuality?.score,
								writingQualityReasoning:
									scores.writingQuality?.reasoning,
								overallScore: scores.overall,
							},
						});

						completed++;
						console.log(
							`   ✅ [${completed}/${testRuns.length}] ${
								testCase.id
							}@${
								modelId.split("/")[1]
							}: ${scores.overall.toFixed(1)}/10`
						);
					} catch (error) {
						console.error(
							`   ❌ ${testCase.id}@${modelId}: ${error}`
						);

						// Save error result
						await prisma.benchmarkResult.create({
							data: {
								runId: run.id,
								testCaseId: testCase.id,
								category:
									testCase.category === "tool_usage"
										? BenchmarkCategory.TOOL_USAGE
										: BenchmarkCategory.WRITING_QUALITY,
								modelId,
								inferenceTimeMs: 0,
								inputTokens: 0,
								outputTokens: 0,
								costUsd: 0,
								responseText: `ERROR: ${error}`,
								memoriesUsed: [],
								overallScore: 0,
							},
						});
						completed++;
					}
				})
			);
		}

		// Mark run as completed
		await prisma.benchmarkRun.update({
			where: { id: run.id },
			data: {
				status: BenchmarkStatus.COMPLETED,
				endedAt: new Date(),
			},
		});

		console.log(`\n✅ Benchmark completed: ${run.id}`);
		return run.id;
	} catch (error) {
		// Mark run as failed
		await prisma.benchmarkRun.update({
			where: { id: run.id },
			data: {
				status: BenchmarkStatus.FAILED,
				endedAt: new Date(),
			},
		});

		throw error;
	}
}

/**
 * Run a single test case against a specific model.
 */
async function runSingleTest(
	testCase: TestCase,
	modelId: string
): Promise<BenchmarkResultInput> {
	const startTime = Date.now();
	const collectedToolCalls: Array<{
		name: string;
		args: unknown;
		result?: unknown;
	}> = [];

	// Build conversation history from setup
	const messages: ModelMessage[] = testCase.setup.session.map((m) => ({
		role: m.role,
		content: m.content,
	}));
	messages.push({ role: "user", content: testCase.userMessage });

	// Build simplified system prompt
	const systemPrompt = buildBenchmarkSystemPrompt(testCase);

	// Create mock tools that capture calls but don't persist
	const tools = createMockTools();

	// Initialize model
	const model = openrouter(modelId);
	let responseText = "";
	let usage = { promptTokens: 0, completionTokens: 0 };

	try {
		const result = streamText({
			model,
			system: systemPrompt,
			messages,
			tools,
			stopWhen: stepCountIs(3), // Limit tool iterations for benchmark
			onStepFinish: (step) => {
				if (step.toolCalls && Array.isArray(step.toolCalls)) {
					for (let i = 0; i < step.toolCalls.length; i++) {
						const tc = step.toolCalls[i];
						// Log the actual structure for debugging
						console.log(
							`[Benchmark] Tool call structure:`,
							JSON.stringify(tc, null, 2)
						);

						const tr = step.toolResults?.[i] as
							| { result?: unknown }
							| undefined;

						// AI SDK v5 might have different property names
						const toolName =
							(tc as { toolName?: string; name?: string })
								.toolName ||
							(tc as { name?: string }).name ||
							"unknown";
						const args =
							(tc as { args?: unknown; input?: unknown }).args ||
							(tc as { input?: unknown }).input ||
							{};

						collectedToolCalls.push({
							name: toolName,
							args: args,
							result: tr?.result,
						});
					}
				}
			},
		});

		// Collect full response
		for await (const chunk of result.textStream) {
			responseText += chunk;
		}

		// Get final usage - AI SDK v5 uses inputTokens/outputTokens
		const finalUsage = await result.usage;
		usage = {
			promptTokens:
				(finalUsage as { inputTokens?: number }).inputTokens ?? 0,
			completionTokens:
				(finalUsage as { outputTokens?: number }).outputTokens ?? 0,
		};
	} catch (error) {
		console.error(`[Benchmark] Inference error for ${modelId}:`, error);
		responseText = `ERROR: ${error}`;
	}

	const inferenceTimeMs = Date.now() - startTime;

	// Calculate cost
	const costUsd = await fetchModelCost(
		modelId,
		usage.promptTokens,
		usage.completionTokens
	);

	return {
		testCaseId: testCase.id,
		category:
			testCase.category === "tool_usage"
				? BenchmarkCategory.TOOL_USAGE
				: BenchmarkCategory.WRITING_QUALITY,
		modelId,
		inferenceTimeMs,
		inputTokens: usage.promptTokens,
		outputTokens: usage.completionTokens,
		reasoningTokens: null,
		costUsd,
		responseText,
		toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
		sessionUsed: {
			messageCount: testCase.setup.session.length,
			sessions: testCase.setup.session.length > 0 ? 1 : 0,
		},
		memoriesUsed: testCase.setup.memories.map((m) => m.key),
	};
}

/**
 * Build a simplified system prompt for benchmark testing.
 */
function buildBenchmarkSystemPrompt(testCase: TestCase): string {
	const profile = testCase.setup.userContext.profile;
	const preferences = testCase.setup.userContext.preferences;
	const memories = testCase.setup.memories;

	const profileStr = profile
		? `Nome: ${profile.name || "N/A"}, Sport: ${
				profile.sport || "N/A"
		  }, Obiettivo: ${profile.goal || "N/A"}, Esperienza: ${
				profile.experience || "N/A"
		  }`
		: "Nessun profilo.";

	const preferencesStr = preferences
		? `Tono: ${preferences.tone || "default"}, Modalità: ${
				preferences.mode || "default"
		  }, Lingua: ${preferences.language || "IT"}`
		: "Preferenze default.";

	const memoriesStr =
		memories.length > 0
			? memories.map((m) => `- ${m.key}: ${m.value}`).join("\n")
			: "Nessuna memoria salvata.";

	return `Sei Anthon, un coach digitale di performance sportiva.
Aiuti atleti, coach e genitori a migliorare mentalità, tecnica, motivazione e performance.

Non dire mai che sei un modello o un'AI. Sei un coach professionale.

PRIORITÀ (in ordine)
1) Sicurezza e benessere dell'utente.
2) Rispondere alla richiesta dell'utente (in modo utile e pratico).
3) Usare contesto affidabile (profilo, preferenze, memorie, cronologia).
4) **SALVARE nuove info con i tool appropriati**, poi rispondere nello stesso turno.
5) Stile: chiaro, diretto, orientato all'azione.

STILE
- Tono: professionale, onesto, empatico ma non compiacente.
- Linguaggio: semplice, concreto, senza frasi motivazionali vuote.
- Adatta la lunghezza: se l'utente scrive breve, rispondi breve.

FORMATO RISPOSTA (default)
1) 1 frase di riconoscimento emotivo (breve).
2) 2–4 azioni pratiche (bullet).
3) 1 domanda finale che porta a un'azione concreta.
Adatta questo formato se l'utente chiede esplicitamente altro.

======= ISTRUZIONI TOOL (FONDAMENTALE) =======
HAI ACCESSO A QUESTI TOOL - USALI ATTIVAMENTE:

1) **updateProfile** - USALO SEMPRE quando l'utente:
   - Si presenta con il nome → salva name
   - Menziona il suo sport → salva sport
   - Dichiara un obiettivo → salva goal
   - Indica la sua esperienza → salva experience
   ESEMPIO: "Ciao sono Marco, gioco a calcio" → DEVI chiamare updateProfile({name: "Marco", sport: "calcio"})

2) **updatePreferences** - Usalo quando l'utente:
   - Esprime come vuole essere trattato (tono)
   - Chiede un approccio specifico (mode)
   - Indica la lingua preferita

3) **saveMemory** - Usalo per informazioni importanti non strutturate:
   - Infortuni passati
   - Date di gare importanti
   - Informazioni sul coach/squadra

4) **tavilySearch** - Usalo per:
   - Domande su eventi recenti o risultati sportivi
   - Informazioni che richiedono dati aggiornati

5) **addNotes** - Per note sul profilo

6) **getMemories** - NON usarlo se le memorie sono già nel contesto

REGOLE TOOL:
- Se l'utente fornisce nuove info su sé stesso → USA IL TOOL APPROPRIATO
- Dopo aver chiamato il tool, rispondi comunque all'utente nello stesso messaggio
- NON menzionare mai i tool all'utente
==============================================

DATA
${new Date().toLocaleDateString("it-IT", {
	weekday: "long",
	year: "numeric",
	month: "long",
	day: "numeric",
})}

CONTESTO UTENTE (già salvato)
${profileStr}

PREFERENZE
${preferencesStr}

MEMORIE UTENTE
${memoriesStr}`;
}

/**
 * Create mock tools that capture calls without persisting.
 */
function createMockTools() {
	const { tool } = require("ai");
	const { z } = require("zod");

	return {
		updateProfile: tool({
			description: "Aggiorna il profilo dell'utente",
			parameters: z.object({
				name: z.string().optional(),
				sport: z.string().optional(),
				goal: z.string().optional(),
				experience: z.string().optional(),
			}),
			execute: async (params: Record<string, string>) => ({
				success: true,
				message: "Profilo aggiornato (mock)",
				data: params,
			}),
		}),

		updatePreferences: tool({
			description: "Aggiorna le preferenze dell'utente",
			parameters: z.object({
				tone: z.string().optional(),
				mode: z.string().optional(),
				language: z.string().optional(),
			}),
			execute: async (params: Record<string, string>) => ({
				success: true,
				message: "Preferenze aggiornate (mock)",
				data: params,
			}),
		}),

		saveMemory: tool({
			description: "Salva un fatto nella memoria",
			parameters: z.object({
				key: z.string(),
				value: z.string(),
				category: z.string().optional(),
			}),
			execute: async (params: Record<string, string>) => ({
				success: true,
				message: "Memoria salvata (mock)",
				data: params,
			}),
		}),

		getMemories: tool({
			description: "Recupera le memorie dell'utente",
			parameters: z.object({
				category: z.string().optional(),
			}),
			execute: async () => ({
				success: true,
				data: [],
				message: "Nessuna memoria (mock)",
			}),
		}),

		tavilySearch: tool({
			description: "Cerca informazioni sul web",
			parameters: z.object({
				query: z.string(),
			}),
			execute: async (params: { query: string }) => ({
				success: true,
				results: [
					{
						title: "Mock search result",
						content: `Risultati di ricerca per: ${params.query}`,
					},
				],
			}),
		}),

		addNotes: tool({
			description: "Aggiungi note sul profilo",
			parameters: z.object({
				note: z.string(),
			}),
			execute: async (params: { note: string }) => ({
				success: true,
				message: "Nota aggiunta (mock)",
				note: params.note,
			}),
		}),
	};
}

/**
 * Fetch model cost from OpenRouter API or fallback to TokenLens.
 */
async function fetchModelCost(
	modelId: string,
	inputTokens: number,
	outputTokens: number
): Promise<number> {
	try {
		// Try OpenRouter API first
		const res = await fetch(
			`https://openrouter.ai/api/v1/models/${encodeURIComponent(
				modelId
			)}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				},
			}
		);

		if (res.ok) {
			const data = (await res.json()) as {
				data?: { pricing?: { prompt?: string; completion?: string } };
			};
			const pricing = data.data?.pricing;

			if (pricing?.prompt && pricing?.completion) {
				const inputCost =
					(inputTokens / 1_000_000) * parseFloat(pricing.prompt);
				const outputCost =
					(outputTokens / 1_000_000) * parseFloat(pricing.completion);
				return inputCost + outputCost;
			}
		}
	} catch {
		// Ignore and fallback
	}

	// Fallback to TokenLens
	const { calculateCost } = await import("@/lib/ai/tokenlens");
	return calculateCost(modelId, inputTokens, outputTokens).totalCost;
}

/**
 * Get benchmark run with results.
 */
export async function getBenchmarkRun(runId: string) {
	return prisma.benchmarkRun.findUnique({
		where: { id: runId },
		include: {
			results: {
				orderBy: [{ modelId: "asc" }, { testCaseId: "asc" }],
			},
		},
	});
}

/**
 * List all benchmark runs.
 */
export async function listBenchmarkRuns(limit = 20) {
	return prisma.benchmarkRun.findMany({
		orderBy: { createdAt: "desc" },
		take: limit,
		include: {
			_count: {
				select: { results: true },
			},
		},
	});
}

/**
 * Get aggregated scores by model for a run.
 */
export async function getModelScores(runId: string) {
	const results = await prisma.benchmarkResult.findMany({
		where: { runId },
	});

	const byModel = new Map<
		string,
		{
			scores: number[];
			times: number[];
			costs: number[];
			toolScores: number[];
			writingScores: number[];
			inputTokens: number;
			outputTokens: number;
		}
	>();

	for (const r of results) {
		if (!byModel.has(r.modelId)) {
			byModel.set(r.modelId, {
				scores: [],
				times: [],
				costs: [],
				toolScores: [],
				writingScores: [],
				inputTokens: 0,
				outputTokens: 0,
			});
		}

		const m = byModel.get(r.modelId)!;
		m.scores.push(r.overallScore);
		m.times.push(r.inferenceTimeMs);
		m.costs.push(r.costUsd);
		m.inputTokens += r.inputTokens;
		m.outputTokens += r.outputTokens;

		if (r.toolUsageScore !== null) {
			m.toolScores.push(r.toolUsageScore);
		}
		if (r.writingQualityScore !== null) {
			m.writingScores.push(r.writingQualityScore);
		}
	}

	const avg = (arr: number[]) =>
		arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

	return Array.from(byModel.entries()).map(([modelId, data]) => ({
		modelId,
		testCount: data.scores.length,
		avgOverallScore: avg(data.scores),
		avgInferenceTimeMs: avg(data.times),
		avgCostUsd: avg(data.costs),
		avgToolUsageScore:
			data.toolScores.length > 0 ? avg(data.toolScores) : null,
		avgWritingQualityScore:
			data.writingScores.length > 0 ? avg(data.writingScores) : null,
		totalInputTokens: data.inputTokens,
		totalOutputTokens: data.outputTokens,
		totalCostUsd: data.costs.reduce((a, b) => a + b, 0),
	}));
}
