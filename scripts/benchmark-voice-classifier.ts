import { generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";

(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

const DEFAULT_MODELS = [
  "mistralai/ministral-3b-2512",
  "google/gemini-2.5-flash-lite",
];
const DEFAULT_RUNS = 100;
const DEFAULT_TIMEOUT_MS = 1500;

const suitabilitySchema = z.object({
  category: z.enum([
    "VOICE_STRONG",
    "VOICE_NATURAL",
    "TEXT_PREFERRED",
    "TEXT_REQUIRED",
  ]),
  reason: z.enum([
    "emotional_support",
    "brief_motivation",
    "reflective_coaching",
    "storytelling",
    "natural_conversation",
    "short_factual",
    "technical_or_structured",
    "needs_visual_precision",
    "unclear",
  ]),
  confidence: z.number().min(0).max(1),
});

type Category = z.infer<typeof suitabilitySchema>["category"];

type Scenario = {
  id: string;
  userMessage: string;
  context: string;
  expected: Category;
};

const scenarios: Scenario[] = [
  {
    id: "pre_competition_anxiety",
    userMessage: "Mi sento in ansia prima della gara, aiutami a calmarmi.",
    context: "assistant: Dimmi cosa senti nel corpo in questo momento.",
    expected: "VOICE_STRONG",
  },
  {
    id: "motivational_story",
    userMessage: "Raccontami una storia breve per ritrovare motivazione.",
    context: "assistant: Posso raccontarti un episodio sportivo.",
    expected: "VOICE_NATURAL",
  },
  {
    id: "short_factual",
    userMessage: "Che ore sono a Roma?",
    context: "assistant: Ti rispondo in modo diretto.",
    expected: "TEXT_PREFERRED",
  },
  {
    id: "structured_table",
    userMessage: "Scrivimi una tabella con serie, ripetizioni e recuperi.",
    context: "assistant: Preparo un piano strutturato.",
    expected: "TEXT_REQUIRED",
  },
  {
    id: "post_loss_support",
    userMessage: "Ho perso ancora e mi sento completamente bloccato.",
    context: "assistant: Sono qui, affrontiamolo un passo alla volta.",
    expected: "VOICE_STRONG",
  },
  {
    id: "reflective_coaching",
    userMessage: "Parliamo di cosa ho imparato dall'allenamento di oggi.",
    context: "assistant: Quale momento ti è rimasto più impresso?",
    expected: "VOICE_NATURAL",
  },
  {
    id: "link_only",
    userMessage: "Dammi solo il link alla pagina ufficiale.",
    context: "assistant: Ho trovato la fonte richiesta.",
    expected: "TEXT_PREFERRED",
  },
  {
    id: "exact_command",
    userMessage: "Mostrami il comando esatto da eseguire nel terminale.",
    context: "assistant: Serve precisione visiva.",
    expected: "TEXT_REQUIRED",
  },
];

type RunResult = {
  model: string;
  scenarioId: string;
  expected: Category;
  durationMs: number;
  success: boolean;
  correct: boolean;
  category?: Category;
  errorName?: string;
};

function readIntegerArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readModels(): string[] {
  const index = process.argv.indexOf("--models");
  if (index < 0) return DEFAULT_MODELS;
  const models = process.argv[index + 1]
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  if (!models?.length) throw new Error("--models must not be empty");
  return models;
}

function getProviderOptions(modelId: string) {
  const providerOptions = getOpenRouterProviderOptionsForModel(modelId);
  const provider =
    providerOptions.provider && typeof providerOptions.provider === "object"
      ? providerOptions.provider
      : {};
  return {
    ...providerOptions,
    provider: { ...provider, require_parameters: true },
  };
}

async function runClassification(
  model: string,
  scenario: Scenario,
  timeoutMs: number,
): Promise<RunResult> {
  const startedAt = performance.now();
  try {
    const result = await generateText({
      model: openrouter(model),
      output: Output.object({ schema: suitabilitySchema }),
      temperature: 0,
      maxOutputTokens: 80,
      maxRetries: 0,
      timeout: { totalMs: timeoutMs },
      providerOptions: { openrouter: getProviderOptions(model) },
      prompt: `Classify the best delivery format for this coaching response.

VOICE_STRONG: emotional support, grounding, motivation, or a moment where tone materially helps.
VOICE_NATURAL: reflective coaching, storytelling, or natural conversational explanation.
TEXT_REQUIRED: code, dense data, exact commands, complex tables, or content that must be seen precisely.
TEXT_PREFERRED: short factual or coordination content where audio adds little value.

Recent conversation:
${scenario.context}

User: ${scenario.userMessage}
Assistant response has not been generated yet.`,
    });
    return {
      model,
      scenarioId: scenario.id,
      expected: scenario.expected,
      durationMs: performance.now() - startedAt,
      success: true,
      correct: result.output.category === scenario.expected,
      category: result.output.category,
    };
  } catch (error) {
    return {
      model,
      scenarioId: scenario.id,
      expected: scenario.expected,
      durationMs: performance.now() - startedAt,
      success: false,
      correct: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(quantile * sorted.length) - 1,
  );
  return Math.round(sorted[index] * 10) / 10;
}

function summarize(model: string, results: RunResult[]) {
  const modelResults = results.filter((result) => result.model === model);
  const successful = modelResults.filter((result) => result.success);
  const failures = modelResults.filter((result) => !result.success);
  const errorCounts = failures.reduce<Record<string, number>>(
    (counts, result) => {
      const name = result.errorName ?? "UnknownError";
      counts[name] = (counts[name] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const scenarioResults = scenarios.map((scenario) => {
    const matching = modelResults.filter(
      (result) => result.scenarioId === scenario.id,
    );
    const matchingSuccesses = matching.filter((result) => result.success);
    return {
      id: scenario.id,
      expected: scenario.expected,
      attempts: matching.length,
      successRate: matchingSuccesses.length / matching.length,
      accuracy: matchingSuccesses.length
        ? matchingSuccesses.filter((result) => result.correct).length /
          matchingSuccesses.length
        : 0,
      predictions: matching.reduce<Record<string, number>>((counts, result) => {
        const prediction = result.category ?? "ERROR";
        counts[prediction] = (counts[prediction] ?? 0) + 1;
        return counts;
      }, {}),
    };
  });
  return {
    model,
    attempts: modelResults.length,
    successes: successful.length,
    successRate: successful.length / modelResults.length,
    accuracy: successful.length
      ? successful.filter((result) => result.correct).length / successful.length
      : 0,
    latencyMs: {
      p50: percentile(
        successful.map((result) => result.durationMs),
        0.5,
      ),
      p95: percentile(
        successful.map((result) => result.durationMs),
        0.95,
      ),
      p99: percentile(
        successful.map((result) => result.durationMs),
        0.99,
      ),
    },
    errors: errorCounts,
    scenarios: scenarioResults,
  };
}

const runs = readIntegerArg("--runs", DEFAULT_RUNS);
const timeoutMs = readIntegerArg("--timeout-ms", DEFAULT_TIMEOUT_MS);
const models = readModels();
const results: RunResult[] = [];

for (let run = 0; run < runs; run += 1) {
  const scenario = scenarios[run % scenarios.length];
  const orderedModels = run % 2 === 0 ? models : [...models].reverse();
  for (const model of orderedModels) {
    results.push(await runClassification(model, scenario, timeoutMs));
  }
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      region: "local-client-network",
      runsPerModel: runs,
      timeoutMs,
      syntheticScenarios: scenarios.length,
      summaries: models.map((model) => summarize(model, results)),
    },
    null,
    2,
  ),
);
