import { generateText, Output } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForClassifier } from "@/lib/ai/providers/openrouter-routing";
import {
  scoreVoiceClassifier,
  type VoiceClassifierBenchmarkResult,
} from "@/lib/benchmark/voice-classifier";
import type { VoiceSuitability } from "@/lib/voice/decision";
import { detectVoiceRequestIntent } from "@/lib/voice/policy";
import { getDeterministicVoiceSuitability } from "@/lib/voice/suitability";
import {
  buildVoiceSuitabilityPrompt,
  type VoiceSuitabilityCategory,
  type VoiceSuitabilityPromptVariant,
  voiceSuitabilitySchema,
} from "@/lib/voice/suitability-prompt";

(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

const NEMOTRON_MODEL = "nvidia/nemotron-3.5-lightning";
const DEFAULT_MODELS = ["google/gemini-2.5-flash-lite", NEMOTRON_MODEL];
const DEFAULT_RUNS = 100;
const DEFAULT_TIMEOUT_MS = 1500;

type Scenario = {
  id: string;
  userMessage: string;
  context: string;
  expected: VoiceSuitabilityCategory;
  protectedText: boolean;
};

const scenarios: Scenario[] = [
  {
    id: "pre_competition_anxiety",
    userMessage: "Mi sento in ansia prima della gara, aiutami a calmarmi.",
    context: "assistant: Dimmi cosa senti nel corpo in questo momento.",
    expected: "VOICE_STRONG",
    protectedText: false,
  },
  {
    id: "motivational_story",
    userMessage: "Raccontami una storia breve per ritrovare motivazione.",
    context: "assistant: Posso raccontarti un episodio sportivo.",
    expected: "VOICE_NATURAL",
    protectedText: false,
  },
  {
    id: "short_factual",
    userMessage: "Che ore sono a Roma?",
    context: "assistant: Ti rispondo in modo diretto.",
    expected: "TEXT_PREFERRED",
    protectedText: true,
  },
  {
    id: "structured_table",
    userMessage: "Scrivimi una tabella con serie, ripetizioni e recuperi.",
    context: "assistant: Preparo un piano strutturato.",
    expected: "TEXT_REQUIRED",
    protectedText: true,
  },
  {
    id: "post_loss_support",
    userMessage: "Ho perso ancora e mi sento completamente bloccato.",
    context: "assistant: Sono qui, affrontiamolo un passo alla volta.",
    expected: "VOICE_STRONG",
    protectedText: false,
  },
  {
    id: "reflective_coaching",
    userMessage: "Parliamo di cosa ho imparato dall'allenamento di oggi.",
    context: "assistant: Quale momento ti è rimasto più impresso?",
    expected: "VOICE_NATURAL",
    protectedText: false,
  },
  {
    id: "link_only",
    userMessage: "Dammi solo il link alla pagina ufficiale.",
    context: "assistant: Ho trovato la fonte richiesta.",
    expected: "TEXT_PREFERRED",
    protectedText: true,
  },
  {
    id: "exact_command",
    userMessage: "Mostrami il comando esatto da eseguire nel terminale.",
    context: "assistant: Serve precisione visiva.",
    expected: "TEXT_REQUIRED",
    protectedText: true,
  },
];

type RunResult = VoiceClassifierBenchmarkResult & {
  model: string;
  scenarioId: string;
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

function readNemotronVariant(): VoiceSuitabilityPromptVariant {
  const index = process.argv.indexOf("--nemotron-variant");
  if (index < 0) return "nemotron_a";
  const value = process.argv[index + 1];
  if (value !== "a" && value !== "b") {
    throw new Error("--nemotron-variant must be a or b");
  }
  return value === "a" ? "nemotron_a" : "nemotron_b";
}

function getProviderOptions(modelId: string) {
  const providerOptions = getOpenRouterProviderOptionsForClassifier(modelId);
  const provider =
    providerOptions.provider && typeof providerOptions.provider === "object"
      ? providerOptions.provider
      : {};
  return {
    ...providerOptions,
    provider: { ...provider, require_parameters: true },
  };
}

function getEffectiveCategory(
  scenario: Scenario,
  rawCategory?: VoiceSuitabilityCategory,
): VoiceSuitability {
  const deterministic = getDeterministicVoiceSuitability({
    userMessage: scenario.userMessage,
    requestIntent: detectVoiceRequestIntent(scenario.userMessage),
  });
  return deterministic?.category ?? rawCategory ?? "TEXT_PREFERRED";
}

async function runClassification(
  model: string,
  scenario: Scenario,
  timeoutMs: number,
  nemotronVariant: VoiceSuitabilityPromptVariant,
): Promise<RunResult> {
  const startedAt = performance.now();
  try {
    const result = await generateText({
      model: openrouter(model),
      output: Output.object({ schema: voiceSuitabilitySchema }),
      temperature: 0,
      maxOutputTokens: 80,
      maxRetries: 0,
      timeout: { totalMs: timeoutMs },
      providerOptions: { openrouter: getProviderOptions(model) },
      prompt: buildVoiceSuitabilityPrompt(
        {
          recentConversation: scenario.context,
          userMessage: scenario.userMessage,
        },
        model === NEMOTRON_MODEL ? nemotronVariant : "baseline",
      ),
    });
    const rawCategory = result.output.category;
    return {
      model,
      scenarioId: scenario.id,
      expected: scenario.expected,
      protectedText: scenario.protectedText,
      durationMs: performance.now() - startedAt,
      rawCategory,
      effectiveCategory: getEffectiveCategory(scenario, rawCategory),
    };
  } catch (error) {
    return {
      model,
      scenarioId: scenario.id,
      expected: scenario.expected,
      protectedText: scenario.protectedText,
      durationMs: performance.now() - startedAt,
      effectiveCategory: getEffectiveCategory(scenario),
      errorName: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

function summarize(model: string, results: RunResult[]) {
  const modelResults = results.filter((result) => result.model === model);
  const failures = modelResults.filter(
    (result) => result.rawCategory === undefined,
  );
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
    return {
      id: scenario.id,
      expected: scenario.expected,
      protectedText: scenario.protectedText,
      attempts: matching.length,
      rawPredictions: matching.reduce<Record<string, number>>(
        (counts, result) => {
          const prediction = result.rawCategory ?? "ERROR";
          counts[prediction] = (counts[prediction] ?? 0) + 1;
          return counts;
        },
        {},
      ),
      effectivePredictions: matching.reduce<Record<string, number>>(
        (counts, result) => {
          counts[result.effectiveCategory] =
            (counts[result.effectiveCategory] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    };
  });
  return {
    model,
    provider: model === NEMOTRON_MODEL ? "DeepInfra" : "OpenRouter latency",
    score: scoreVoiceClassifier(modelResults),
    errors: errorCounts,
    scenarios: scenarioResults,
  };
}

const runs = readIntegerArg("--runs", DEFAULT_RUNS);
const timeoutMs = readIntegerArg("--timeout-ms", DEFAULT_TIMEOUT_MS);
const models = readModels();
const nemotronVariant = readNemotronVariant();
const results: RunResult[] = [];

for (let run = 0; run < runs; run += 1) {
  const scenario = scenarios[run % scenarios.length];
  const orderedModels = run % 2 === 0 ? models : [...models].reverse();
  for (const model of orderedModels) {
    results.push(
      await runClassification(model, scenario, timeoutMs, nemotronVariant),
    );
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
      nemotronVariant,
      summaries: models.map((model) => summarize(model, results)),
    },
    null,
    2,
  ),
);
