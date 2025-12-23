/**
 * Benchmark Runner
 *
 * Executes benchmark test cases against multiple AI models and collects metrics.
 */

import { type ModelMessage, stepCountIs, streamText } from "ai";
import {
  BenchmarkCategory,
  BenchmarkStatus,
  type Prisma,
} from "@/generated/prisma";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";
import { evaluateResultWithConsensus } from "./judge";
import type {
  BenchmarkResultInput,
  BenchmarkRunnerOptions,
  TestCase,
  TestCaseSetup,
} from "./types";

// Fetches test cases from database
async function fetchTestCases(options: {
  testCaseIds?: string[];
  categories?: ("tool_usage" | "writing_quality")[];
}): Promise<TestCase[]> {
  const where: Prisma.BenchmarkTestCaseWhereInput = { isActive: true };

  if (options.testCaseIds?.length) {
    where.externalId = { in: options.testCaseIds };
  }

  if (options.categories?.length) {
    where.category = {
      in: options.categories.map((c) =>
        c.toUpperCase(),
      ) as unknown as BenchmarkCategory[],
    };
  }

  return await prisma.benchmarkTestCase.findMany({ where });
}

import { DEFAULT_MODELS } from "./constants";

// Mock user ID for benchmark runs
const _BENCHMARK_USER_ID = "benchmark-user-000";

/**
 * Run a complete benchmark with all test cases and models.
 */
export async function runBenchmark(
  options: BenchmarkRunnerOptions = {},
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
    // Fetch test cases from database
    const testCases = await fetchTestCases({
      testCaseIds: options.testCaseIds,
      categories: options.categories,
    });

    console.log(`📝 Test cases: ${testCases.length}`);

    // Build list of all test runs (testCase + model combinations)
    const iterations = options.iterations || 1;
    const testRuns: Array<{
      testCase: TestCase;
      modelId: string;
      iteration: number;
    }> = [];
    for (let i = 0; i < iterations; i++) {
      for (const testCase of testCases) {
        for (const modelId of models) {
          testRuns.push({ testCase, modelId, iteration: i + 1 });
        }
      }
    }

    console.log(`🔄 Total runs: ${testRuns.length} (parallel worker pool)`);

    // Update run with total tests
    await prisma.benchmarkRun.update({
      where: { id: run.id },
      data: { totalTests: testRuns.length },
    });

    // Run tests with worker pool (constant concurrency)
    const concurrency = options.concurrency || 10;
    let completed = 0;

    // Function to run a single test and handle results
    const runWorker = async (runIndex: number) => {
      const { testCase, modelId, iteration } = testRuns[runIndex];
      console.log(
        `🧪 Running [${runIndex + 1}/${testRuns.length}]: ${testCase.id} with ${
          modelId.split("/")[1]
        } (Iter ${iteration}/${iterations})`,
      );

      // Check for cancellation signal
      const currentRun = await prisma.benchmarkRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });

      if (currentRun?.status === BenchmarkStatus.CANCELLED) {
        console.log(`⏹️ Benchmark ${run.id} was CANCELLED. Stopping worker.`);
        return;
      }

      // Record current progress
      await prisma.benchmarkRun.update({
        where: { id: run.id },
        data: {
          currentProgress: {
            testCaseId: testCase.id,
            modelId,
            startedAt: new Date(),
          },
        },
      });

      try {
        // Execute test
        const result = await runSingleTest(testCase, modelId);

        // Evaluate with AI judges (multi-judge consensus)
        const consensus = await evaluateResultWithConsensus(testCase, result);
        const {
          judge1,
          judge2,
          consensusScore,
          judgeDisagreement,
          flaggedForReview,
        } = consensus;

        // Save to database with all judge data
        await prisma.benchmarkResult.create({
          data: {
            runId: run.id,
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
            toolCalls: result.toolCalls ?? undefined,
            sessionUsed: result.sessionUsed,
            memoriesUsed: result.memoriesUsed,
            // Judge 1 scores
            toolUsageScore: judge1.toolUsage?.score,
            toolUsageReasoning: judge1.toolUsage?.reasoning,
            toolUsageCritique: judge1.toolUsage?.critique ?? undefined,
            writingQualityScore: judge1.writingQuality?.score,
            writingQualityReasoning: judge1.writingQuality?.reasoning,
            writingQualityCritique:
              judge1.writingQuality?.critique ?? undefined,
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

        completed++;

        // Update progress in database
        await prisma.benchmarkRun.update({
          where: { id: run.id },
          data: { completedTests: completed },
        });

        console.log(
          `   ✅ [${completed}/${testRuns.length}] ${testCase.id}@${
            modelId.split("/")[1]
          }: ${consensusScore.toFixed(1)}/10 ${
            flaggedForReview ? "⚠️ FLAGGED" : ""
          }`,
        );
      } catch (error) {
        console.error(`   ❌ ${testCase.id}@${modelId}: ${error}`);

        // Save error result
        await prisma.benchmarkResult.create({
          data: {
            runId: run.id,
            testCaseId: testCase.id,
            category:
              testCase.category === BenchmarkCategory.TOOL_USAGE
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

        // Update progress in database even on failure
        await prisma.benchmarkRun.update({
          where: { id: run.id },
          data: { completedTests: completed },
        });
      }
    };

    // Fill the pool
    const pool: Promise<void>[] = [];
    let nextIndex = 0;

    const startNext = async (): Promise<void> => {
      if (nextIndex >= testRuns.length) return;
      const index = nextIndex++;
      await runWorker(index);
      await startNext();
    };

    for (let i = 0; i < Math.min(concurrency, testRuns.length); i++) {
      pool.push(startNext());
    }

    await Promise.all(pool);

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
 * Run a benchmark for an existing run record.
 * This is used for background execution where the run is created first.
 */
export async function runBenchmarkForExistingRun(
  runId: string,
  options: Omit<BenchmarkRunnerOptions, "runName" | "description"> = {},
): Promise<void> {
  // Fetch the existing run
  const run = await prisma.benchmarkRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error(`Benchmark run not found: ${runId}`);
  }

  const models = options.models || run.models;

  // Update run to RUNNING status
  await prisma.benchmarkRun.update({
    where: { id: runId },
    data: {
      status: BenchmarkStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  console.log(`🚀 Starting benchmark run: ${runId}`);
  console.log(`📊 Models: ${models.join(", ")}`);

  try {
    // Fetch test cases from database
    const testCases = await fetchTestCases({
      testCaseIds: options.testCaseIds,
      categories: options.categories,
    });

    console.log(`📝 Test cases: ${testCases.length}`);

    // Build list of all test runs (testCase + model combinations)
    const iterations = options.iterations || 1;
    const testRuns: Array<{
      testCase: TestCase;
      modelId: string;
      iteration: number;
    }> = [];
    for (let i = 0; i < iterations; i++) {
      for (const testCase of testCases) {
        for (const modelId of models) {
          testRuns.push({ testCase, modelId, iteration: i + 1 });
        }
      }
    }

    console.log(`🔄 Total runs: ${testRuns.length} (parallel worker pool)`);

    // Update run with total tests
    await prisma.benchmarkRun.update({
      where: { id: runId },
      data: { totalTests: testRuns.length },
    });

    // Run tests with worker pool (constant concurrency)
    const concurrency = options.concurrency || 10;
    let completed = 0;

    // Function to run a single test and handle results
    const runWorker = async (runIndex: number) => {
      const { testCase, modelId, iteration } = testRuns[runIndex];
      console.log(
        `🧪 Running [${runIndex + 1}/${testRuns.length}]: ${testCase.id} with ${
          modelId.split("/")[1]
        } (Iter ${iteration}/${iterations})`,
      );

      // Check for cancellation signal
      const currentRun = await prisma.benchmarkRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });

      if (currentRun?.status === BenchmarkStatus.CANCELLED) {
        console.log(`⏹️ Benchmark ${runId} was CANCELLED. Stopping worker.`);
        return;
      }

      // Record current progress
      await prisma.benchmarkRun.update({
        where: { id: runId },
        data: {
          currentProgress: {
            testCaseId: testCase.id,
            modelId,
            startedAt: new Date(),
          },
        },
      });

      try {
        // Execute test
        const result = await runSingleTest(testCase, modelId);

        // Evaluate with AI judges (multi-judge consensus)
        const consensus = await evaluateResultWithConsensus(testCase, result);
        const {
          judge1,
          judge2,
          consensusScore,
          judgeDisagreement,
          flaggedForReview,
        } = consensus;

        // Save to database with all judge data
        await prisma.benchmarkResult.create({
          data: {
            runId,
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
            toolCalls: result.toolCalls ?? undefined,
            sessionUsed: result.sessionUsed,
            memoriesUsed: result.memoriesUsed,
            // Judge 1 scores
            toolUsageScore: judge1.toolUsage?.score,
            toolUsageReasoning: judge1.toolUsage?.reasoning,
            toolUsageCritique: judge1.toolUsage?.critique ?? undefined,
            writingQualityScore: judge1.writingQuality?.score,
            writingQualityReasoning: judge1.writingQuality?.reasoning,
            writingQualityCritique:
              judge1.writingQuality?.critique ?? undefined,
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

        completed++;

        // Update progress in database
        await prisma.benchmarkRun.update({
          where: { id: runId },
          data: { completedTests: completed },
        });

        console.log(
          `   ✅ [${completed}/${testRuns.length}] ${testCase.id}@${
            modelId.split("/")[1]
          }: ${consensusScore.toFixed(1)}/10 ${
            flaggedForReview ? "⚠️ FLAGGED" : ""
          }`,
        );
      } catch (error) {
        console.error(`   ❌ ${testCase.id}@${modelId}: ${error}`);

        // Save error result
        await prisma.benchmarkResult.create({
          data: {
            runId,
            testCaseId: testCase.id,
            category:
              testCase.category === BenchmarkCategory.TOOL_USAGE
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

        // Update progress in database even on failure
        await prisma.benchmarkRun.update({
          where: { id: runId },
          data: { completedTests: completed },
        });
      }
    };

    // Fill the pool
    const pool: Promise<void>[] = [];
    let nextIndex = 0;

    const startNext = async (): Promise<void> => {
      if (nextIndex >= testRuns.length) return;
      const index = nextIndex++;
      await runWorker(index);
      await startNext();
    };

    for (let i = 0; i < Math.min(concurrency, testRuns.length); i++) {
      pool.push(startNext());
    }

    await Promise.all(pool);

    // Mark run as completed
    await prisma.benchmarkRun.update({
      where: { id: runId },
      data: {
        status: BenchmarkStatus.COMPLETED,
        endedAt: new Date(),
      },
    });

    console.log(`\n✅ Benchmark completed: ${runId}`);
  } catch (error) {
    // Mark run as failed
    await prisma.benchmarkRun.update({
      where: { id: runId },
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
  modelId: string,
): Promise<BenchmarkResultInput> {
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  const collectedToolCalls: Array<{
    name: string;
    args: unknown;
    result?: unknown;
  }> = [];

  // Build conversation history from setup
  const setup = testCase.setup as unknown as TestCaseSetup;
  const messages: ModelMessage[] = (setup?.session || []).map((m) => ({
    role: m.role as "user" | "assistant",
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
            const tc = step.toolCalls[i] as {
              toolName?: string;
              name?: string;
              args?: unknown;
              input?: unknown;
            };
            const tr = step.toolResults?.[i] as
              | { result?: unknown }
              | undefined;

            const toolName = tc.toolName || tc.name || "unknown";
            const args = tc.args || tc.input || {};

            collectedToolCalls.push({
              name: toolName,
              args: args,
              result: tr?.result,
            });
          }
        }
      },
      onChunk: (chunk) => {
        if (!firstTokenTime && chunk.chunk.type === "text-delta") {
          firstTokenTime = Date.now();
        }
      },
    });

    // Collect full response
    for await (const chunk of result.textStream) {
      responseText += chunk;
    }

    // Get final usage
    const finalUsage = (await result.usage) as {
      promptTokens?: number;
      inputTokens?: number;
      completionTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
    };

    usage = {
      promptTokens: finalUsage.inputTokens ?? finalUsage.promptTokens ?? 0,
      completionTokens:
        finalUsage.outputTokens ?? finalUsage.completionTokens ?? 0,
    };
    const reasoningTokens = finalUsage.reasoningTokens ?? null;

    const ttftMs = firstTokenTime ? firstTokenTime - startTime : null;
    const inferenceTimeMs = Date.now() - startTime;

    // Calculate cost
    const costUsd = await fetchModelCost(
      modelId,
      usage.promptTokens,
      usage.completionTokens,
    );

    return {
      testCaseId: testCase.id,
      category:
        testCase.category === BenchmarkCategory.TOOL_USAGE
          ? BenchmarkCategory.TOOL_USAGE
          : BenchmarkCategory.WRITING_QUALITY,
      modelId,
      inferenceTimeMs,
      ttftMs,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      reasoningTokens,
      costUsd,
      responseText,
      toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
      sessionUsed: {
        messageCount: setup?.session?.length || 0,
        sessions: (setup?.session?.length || 0) > 0 ? 1 : 0,
      },
      memoriesUsed: (setup?.memories || []).map((m: { key: string }) => m.key),
    };
  } catch (error) {
    console.error(`[Benchmark] Inference error for ${modelId}:`, error);
    return {
      testCaseId: testCase.id,
      category:
        testCase.category === BenchmarkCategory.TOOL_USAGE
          ? BenchmarkCategory.TOOL_USAGE
          : BenchmarkCategory.WRITING_QUALITY,
      modelId,
      inferenceTimeMs: 0,
      ttftMs: null,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null,
      costUsd: 0,
      responseText: `ERROR: ${error}`,
      toolCalls: null,
      sessionUsed: { messageCount: 0, sessions: 0 },
      memoriesUsed: [],
    };
  }
}

/**
 * Build a simplified system prompt for benchmark testing.
 */
function buildBenchmarkSystemPrompt(testCase: TestCase): string {
  const setup = testCase.setup as unknown as TestCaseSetup;
  const profile = setup?.userContext?.profile;
  const preferences = setup?.userContext?.preferences;
  const memories = setup?.memories || [];

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

// Cache for OpenRouter model pricing (refreshed every 15 minutes)
let openRouterPricingCache: Map<
  string,
  { prompt: number; completion: number }
> | null = null;
let openRouterPricingCacheExpiry: number = 0;

/**
 * Fetch all model pricing from OpenRouter API with caching.
 */
async function fetchOpenRouterPricing(): Promise<
  Map<string, { prompt: number; completion: number }>
> {
  const now = Date.now();

  // Return cached data if still valid
  if (openRouterPricingCache && now < openRouterPricingCacheExpiry) {
    return openRouterPricingCache;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data: Array<{
          id: string;
          pricing?: { prompt?: string; completion?: string };
        }>;
      };

      const pricingMap = new Map<
        string,
        { prompt: number; completion: number }
      >();

      for (const model of data.data) {
        if (model.pricing?.prompt && model.pricing?.completion) {
          pricingMap.set(model.id, {
            prompt: parseFloat(model.pricing.prompt),
            completion: parseFloat(model.pricing.completion),
          });
        }
      }

      // Cache for 15 minutes
      openRouterPricingCache = pricingMap;
      openRouterPricingCacheExpiry = now + 15 * 60 * 1000;

      console.log(
        `[Benchmark] Cached OpenRouter pricing for ${pricingMap.size} models`,
      );
      return pricingMap;
    }
  } catch (error) {
    console.error("[Benchmark] Failed to fetch OpenRouter pricing:", error);
  }

  // Return empty map on failure
  return new Map();
}

/**
 * Fetch model cost from OpenRouter API or fallback to TokenLens.
 */
async function fetchModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  try {
    // Get pricing from cache (fetches if needed)
    const pricingMap = await fetchOpenRouterPricing();
    const pricing = pricingMap.get(modelId);

    if (pricing) {
      // Pricing is per token (USD)
      const inputCost = inputTokens * pricing.prompt;
      const outputCost = outputTokens * pricing.completion;
      return inputCost + outputCost;
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
      judge1Scores: number[];
      judge2Scores: number[];
      consensusScores: number[];
      times: number[];
      ttfts: number[];
      costs: number[];
      toolScores: number[];
      writingScores: number[];
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      flaggedCount: number;
    }
  >();

  for (const r of results) {
    if (!byModel.has(r.modelId)) {
      byModel.set(r.modelId, {
        scores: [],
        judge1Scores: [],
        judge2Scores: [],
        consensusScores: [],
        times: [],
        ttfts: [],
        costs: [],
        toolScores: [],
        writingScores: [],
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        flaggedCount: 0,
      });
    }

    const m = byModel.get(r.modelId);
    if (m) {
      // Priority: finalScore (admin-weighted) > consensusScore (multi-judge) > overallScore (Judge 1)
      const effectiveScore = r.finalScore ?? r.consensusScore ?? r.overallScore;
      m.scores.push(effectiveScore);

      // Track individual judge scores
      m.judge1Scores.push(r.overallScore);
      if (r.judge2OverallScore !== null) {
        m.judge2Scores.push(r.judge2OverallScore);
      }
      if (r.consensusScore !== null) {
        m.consensusScores.push(r.consensusScore);
      }
      if (r.flaggedForReview) {
        m.flaggedCount++;
      }

      m.times.push(r.inferenceTimeMs);
      if (r.ttftMs !== null) m.ttfts.push(r.ttftMs);
      m.costs.push(r.costUsd);
      m.inputTokens += r.inputTokens;
      m.outputTokens += r.outputTokens;
      m.reasoningTokens += r.reasoningTokens ?? 0;

      if (r.toolUsageScore !== null) {
        m.toolScores.push(r.toolUsageScore);
      }
      if (r.writingQualityScore !== null) {
        m.writingScores.push(r.writingQualityScore);
      }
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const stdDev = (arr: number[]) => {
    if (arr.length <= 1) return 0;
    const mean = avg(arr);
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  return Array.from(byModel.entries()).map(([modelId, data]) => {
    const overallAvg = avg(data.scores);
    const reliability =
      data.scores.filter((s) => s > 0).length / data.scores.length;
    const variance = stdDev(data.scores);

    // Reasoning Efficiency: reasoning tokens / output tokens
    const reasoningEfficiency =
      data.outputTokens > 0 ? data.reasoningTokens / data.outputTokens : null;

    // Token Efficiency Index:
    // Very simple heuristic: 10 * (1 - clamp(outputTokens / avgTokensInRun, 0, 1))
    // better: 10 / (1 + outputTokens / (data.scores.length * 50)) // normalized against expected length
    const tokenEfficiencyIndex =
      data.outputTokens > 0
        ? 10 / (1 + data.outputTokens / (data.scores.length * 100))
        : null;

    return {
      modelId,
      testCount: data.scores.length,
      avgOverallScore: overallAvg, // Now uses consensus score when available
      avgJudge1Score: avg(data.judge1Scores),
      avgJudge2Score:
        data.judge2Scores.length > 0 ? avg(data.judge2Scores) : null,
      avgConsensusScore:
        data.consensusScores.length > 0 ? avg(data.consensusScores) : null,
      flaggedForReviewCount: data.flaggedCount,
      avgInferenceTimeMs: avg(data.times),
      avgTtftMs: data.ttfts.length > 0 ? avg(data.ttfts) : null,
      avgCostUsd: avg(data.costs),
      avgToolUsageScore:
        data.toolScores.length > 0 ? avg(data.toolScores) : null,
      avgWritingQualityScore:
        data.writingScores.length > 0 ? avg(data.writingScores) : null,
      reliability,
      variance,
      reasoningEfficiency,
      tokenEfficiencyIndex,
      totalInputTokens: data.inputTokens,
      totalOutputTokens: data.outputTokens,
      totalCostUsd: data.costs.reduce((a, b) => a + b, 0),
    };
  });
}
