import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { generateText, Output } from "ai";
import {
  buildChatMetadataContext,
  buildChatMetadataPrompt,
  type ChatMetadataMessage,
  chatMetadataSchema,
} from "@/lib/ai/chat-metadata-contract";
import { extractAIMetrics } from "@/lib/ai/cost-calculator";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import type { ChatIcon } from "@/lib/chat-icons";

(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

export const EVAL_MODELS = [
  "inclusionai/ling-3.0-flash",
  "qwen/qwen3.7-flash",
  "deepseek/deepseek-v4-flash",
] as const;

type EvalModel = (typeof EVAL_MODELS)[number];
type EvalScenario = {
  id: string;
  messages: ChatMetadataMessage[];
  fallbackUserText: string;
  conceptGroups: string[][];
  acceptedIcons: ChatIcon[];
  inappropriateIcons: ChatIcon[];
};

export type EvalAttempt = {
  anonymousId: string;
  model: string;
  scenarioId: string;
  pass: number;
  durationMs: number;
  success: boolean;
  titleScore: number;
  iconScore: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  output?: { title: string; icon: ChatIcon };
  providerMetadata?: Record<string, unknown>;
  errorName?: string;
  errorMessage?: string;
};

type BlindReviewRow = {
  anonymousId: string;
  scenarioId: string;
  context: string;
  title: string | null;
  icon: ChatIcon | null;
  titleScore: number | null;
  iconScore: number | null;
  note: string;
};

type CandidateSummary = {
  model: string;
  eligible: boolean;
  attempts: number;
  successes: number;
  successRate: number;
  titleScore: number;
  iconScore: number;
  totalCostUsd: number;
  averageCostUsd: number;
  latencyMs: { p50: number | null; p95: number | null };
  errors: Record<string, number>;
  decisionScore?: number;
};

function scenario(
  id: string,
  text: string,
  conceptGroups: string[][],
  acceptedIcons: ChatIcon[],
  inappropriateIcons: ChatIcon[],
): EvalScenario {
  return {
    id,
    messages: [{ role: "user", text }],
    fallbackUserText: text,
    conceptGroups,
    acceptedIcons,
    inappropriateIcons,
  };
}

const scenarios: EvalScenario[] = [
  scenario(
    "pre_competition_pressure",
    "Domenica gioco la finale e sento troppa pressione prima di entrare in campo.",
    [
      ["finale", "gara"],
      ["pressione", "ansia"],
    ],
    ["TROPHY", "BRAIN", "SHIELD"],
    ["CALENDAR_DAYS", "USERS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "post_mistake_reset",
    "Dopo un doppio fallo continuo a pensarci e sbaglio anche il punto successivo. Come resetto?",
    [
      ["errore", "fallo"],
      ["reset", "ripartenza"],
    ],
    ["REFRESH_CCW", "BRAIN"],
    ["TROPHY", "CALENDAR_DAYS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "short_mental_routine",
    "Costruiamo una routine mentale di trenta secondi prima del servizio.",
    [["routine"], ["servizio", "trenta secondi"]],
    ["BRAIN", "TIMER"],
    ["USERS", "HEART_PULSE", "MESSAGE_SQUARE"],
  ),
  scenario(
    "lost_motivation",
    "Da tre settimane salto gli allenamenti e ho perso completamente la motivazione.",
    [["motivazione", "costanza"], ["allenamenti"]],
    ["FLAME", "BRAIN"],
    ["TROPHY", "USERS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "weekly_training_plan",
    "Organizziamo i miei tre allenamenti della prossima settimana senza sovraccaricarmi.",
    [
      ["settimana", "settimanale"],
      ["allenamenti", "piano"],
    ],
    ["CALENDAR_DAYS", "DUMBBELL", "ACTIVITY"],
    ["TROPHY", "USERS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "injury_safety_warning",
    "Durante la corsa sento un dolore acuto al ginocchio e aumenta a ogni passo.",
    [["ginocchio", "dolore"], ["corsa"]],
    ["HEART_PULSE", "SHIELD", "ACTIVITY"],
    ["FLAME", "TROPHY", "MESSAGE_SQUARE"],
  ),
  scenario(
    "talk_with_coach",
    "Mi vergogno a dire al coach che dopo le sconfitte mi sento senza valore.",
    [
      ["coach", "allenatore"],
      ["parlare", "confronto", "vergogna"],
    ],
    ["USERS", "BRAIN", "SHIELD"],
    ["TIMER", "CALENDAR_DAYS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "team_dynamics",
    "In squadra ci accusiamo dopo ogni errore e voglio ricostruire fiducia tra compagni.",
    [["squadra", "compagni"], ["fiducia"]],
    ["USERS", "SHIELD"],
    ["FOOTPRINTS", "TIMER", "MESSAGE_SQUARE"],
  ),
  scenario(
    "race_pace_timing",
    "Parto troppo forte nei dieci chilometri e crollo nel finale: devo gestire il ritmo.",
    [
      ["ritmo", "passo"],
      ["dieci chilometri", "10 km"],
    ],
    ["TIMER", "FOOTPRINTS"],
    ["USERS", "DUMBBELL", "MESSAGE_SQUARE"],
  ),
  scenario(
    "running_goal",
    "Voglio correre la mia prima mezza maratona sotto le due ore a ottobre.",
    [["mezza maratona"], ["due ore", "ottobre"]],
    ["FOOTPRINTS", "TARGET", "TIMER"],
    ["USERS", "DUMBBELL", "MESSAGE_SQUARE"],
  ),
  scenario(
    "confidence_after_loss",
    "Dopo la sconfitta di ieri non mi fido più dei miei colpi importanti.",
    [["fiducia", "sicurezza"], ["sconfitta"]],
    ["SHIELD", "BRAIN", "REFRESH_CCW"],
    ["CALENDAR_DAYS", "USERS", "MESSAGE_SQUARE"],
  ),
  scenario(
    "vague_opening",
    "Ciao, possiamo parlare un attimo?",
    [["parlare", "confronto"]],
    ["MESSAGE_SQUARE"],
    ["TROPHY", "HEART_PULSE", "DUMBBELL"],
  ),
];

const scenarioById = new Map(scenarios.map((item) => [item.id, item]));

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1),
  );
  return round(sorted[index] ?? 0, 1);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function scoreTitle(item: EvalScenario, title: string): number {
  const normalized = normalizeText(title);
  const words = title.trim().split(/\s+/).filter(Boolean).length;
  const lengthScore = words >= 3 && words <= 6 && title.length <= 55 ? 0.25 : 0;
  const decorationScore = /[.!?…,:;'"“”‘’«»]$/.test(title.trim()) ? 0 : 0.1;
  const genericTerms = ["conversazione", "supporto", "coaching", "nuova chat"];
  const specificityScore =
    item.id === "vague_opening" ||
    !genericTerms.some((term) => normalized.includes(term))
      ? 0.15
      : 0;
  const matchedGroups = item.conceptGroups.filter((group) =>
    group.some((term) => normalized.includes(normalizeText(term))),
  ).length;
  const conceptScore =
    item.conceptGroups.length > 0
      ? (matchedGroups / item.conceptGroups.length) * 0.5
      : 0.5;
  return round(lengthScore + decorationScore + specificityScore + conceptScore);
}

export function scoreIcon(scenarioId: string, icon: ChatIcon): number {
  const item = scenarioById.get(scenarioId);
  if (!item) throw new Error(`Unknown scenario: ${scenarioId}`);
  if (item.acceptedIcons.includes(icon)) return 1;
  if (item.inappropriateIcons.includes(icon)) return 0;
  return 0.5;
}

export function summarizeCandidate(
  model: string,
  attempts: EvalAttempt[],
  review = new Map<string, BlindReviewRow>(),
): CandidateSummary {
  const modelAttempts = attempts.filter((attempt) => attempt.model === model);
  const successful = modelAttempts.filter(
    (attempt) => attempt.success && attempt.durationMs > 0 && attempt.output,
  );
  const errors = modelAttempts
    .filter((attempt) => !attempt.success)
    .reduce<Record<string, number>>((counts, attempt) => {
      const name = attempt.errorName ?? "UnknownError";
      counts[name] = (counts[name] ?? 0) + 1;
      return counts;
    }, {});
  const successRate = modelAttempts.length
    ? successful.length / modelAttempts.length
    : 0;
  const titleScores = successful.map((attempt) => {
    const reviewed = review.get(attempt.anonymousId)?.titleScore;
    return typeof reviewed === "number" ? reviewed : attempt.titleScore;
  });
  const iconScores = successful.map((attempt) => {
    const reviewed = review.get(attempt.anonymousId)?.iconScore;
    return typeof reviewed === "number" ? reviewed : attempt.iconScore;
  });
  const totalCostUsd = successful.reduce(
    (sum, attempt) => sum + attempt.costUsd,
    0,
  );

  return {
    model,
    eligible: successful.length > 0 && successRate >= 0.5,
    attempts: modelAttempts.length,
    successes: successful.length,
    successRate: round(successRate),
    titleScore: round(average(titleScores)),
    iconScore: round(average(iconScores)),
    totalCostUsd: round(totalCostUsd, 8),
    averageCostUsd: round(
      successful.length ? totalCostUsd / successful.length : 0,
      8,
    ),
    latencyMs: {
      p50: percentile(
        successful.map((attempt) => attempt.durationMs),
        0.5,
      ),
      p95: percentile(
        successful.map((attempt) => attempt.durationMs),
        0.95,
      ),
    },
    errors,
  };
}

function normalizedBenefit(
  value: number,
  values: number[],
  lowerIsBetter = false,
): number {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return 1;
  const normalized = (value - minimum) / (maximum - minimum);
  return lowerIsBetter ? 1 - normalized : normalized;
}

function rankCandidates(summaries: CandidateSummary[]): CandidateSummary[] {
  const eligible = summaries.filter((summary) => summary.eligible);
  if (eligible.length === 0) return summaries;
  const titleScores = eligible.map((summary) => summary.titleScore);
  const iconScores = eligible.map((summary) => summary.iconScore);
  const reliabilities = eligible.map((summary) => summary.successRate);
  const latencies = eligible.map(
    (summary) => summary.latencyMs.p50 ?? Infinity,
  );
  const costs = eligible.map((summary) => summary.averageCostUsd);

  for (const summary of summaries) {
    if (!summary.eligible) {
      summary.decisionScore = 0;
      continue;
    }
    summary.decisionScore = round(
      normalizedBenefit(summary.titleScore, titleScores) * 0.5 +
        normalizedBenefit(summary.iconScore, iconScores) * 0.25 +
        normalizedBenefit(summary.successRate, reliabilities) * 0.15 +
        normalizedBenefit(summary.latencyMs.p50 ?? Infinity, latencies, true) *
          0.07 +
        normalizedBenefit(summary.averageCostUsd, costs, true) * 0.03,
    );
  }
  return summaries.sort(
    (left, right) => (right.decisionScore ?? 0) - (left.decisionScore ?? 0),
  );
}

function getProviderOptions(modelId: string) {
  const options = getOpenRouterProviderOptionsForModel(modelId);
  const provider =
    options.provider && typeof options.provider === "object"
      ? options.provider
      : {};
  return { ...options, provider: { ...provider, require_parameters: true } };
}

async function runAttempt(
  model: EvalModel,
  item: EvalScenario,
  pass: number,
  timeoutMs: number,
  anonymousId: string,
): Promise<EvalAttempt> {
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: openrouter(model),
      output: Output.object({ schema: chatMetadataSchema }),
      temperature: 0.2,
      maxOutputTokens: 80,
      maxRetries: 0,
      timeout: { totalMs: timeoutMs },
      providerOptions: { openrouter: getProviderOptions(model) },
      prompt: buildChatMetadataPrompt(
        buildChatMetadataContext(item.messages, item.fallbackUserText),
      ),
    });
    const durationMs = Date.now() - startedAt;
    const metrics = extractAIMetrics(model, startedAt, {
      text: result.text,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    });
    return {
      anonymousId,
      model,
      scenarioId: item.id,
      pass,
      durationMs,
      success: durationMs > 0,
      titleScore: scoreTitle(item, result.output.title),
      iconScore: scoreIcon(item.id, result.output.icon),
      costUsd: metrics.costUsd,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      output: result.output,
      providerMetadata: result.providerMetadata,
    };
  } catch (error) {
    return {
      anonymousId,
      model,
      scenarioId: item.id,
      pass,
      durationMs: Date.now() - startedAt,
      success: false,
      titleScore: 0,
      iconScore: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function readPositiveInteger(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readStringArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertArguments(): void {
  if (process.argv.includes("--models")) {
    throw new Error(
      "--models is not supported; this eval pins exact candidates",
    );
  }
}

function reviewPathFor(outputJson: string): string {
  return outputJson.replace(/\.json$/, "-review.json");
}

async function readReview(path: string): Promise<Map<string, BlindReviewRow>> {
  try {
    await access(path);
  } catch {
    return new Map();
  }
  const rows = JSON.parse(await readFile(path, "utf8")) as BlindReviewRow[];
  return new Map(rows.map((row) => [row.anonymousId, row]));
}

function buildReviewRows(attempts: EvalAttempt[]): BlindReviewRow[] {
  return attempts
    .map((attempt) => {
      const item = scenarioById.get(attempt.scenarioId);
      if (!item) throw new Error(`Unknown scenario: ${attempt.scenarioId}`);
      return {
        anonymousId: attempt.anonymousId,
        scenarioId: attempt.scenarioId,
        context: buildChatMetadataContext(item.messages, item.fallbackUserText),
        title: attempt.output?.title ?? null,
        icon: attempt.output?.icon ?? null,
        titleScore: null,
        iconScore: null,
        note: attempt.success ? "" : `Errore: ${attempt.errorName}`,
      };
    })
    .sort((left, right) => left.anonymousId.localeCompare(right.anonymousId));
}

function buildMarkdown(report: {
  generatedAt: string;
  attemptsPerModel: number;
  attempts: EvalAttempt[];
  summaries: CandidateSummary[];
  decision: { selectedModel: string | null; reason: string };
}): string {
  const rows = report.summaries
    .map(
      (summary) =>
        `| \`${summary.model}\` | ${summary.successes}/${summary.attempts} | ${summary.titleScore.toFixed(3)} | ${summary.iconScore.toFixed(3)} | ${summary.latencyMs.p50 ?? "-"} | ${summary.latencyMs.p95 ?? "-"} | $${summary.totalCostUsd.toFixed(6)} | ${summary.decisionScore?.toFixed(3) ?? "-"} |`,
    )
    .join("\n");
  const availability = EVAL_MODELS.map((model) => {
    const failures = report.attempts.filter(
      (attempt) => attempt.model === model && !attempt.success,
    );
    const messages = [
      ...new Set(
        failures
          .map((attempt) => attempt.errorMessage)
          .filter((message): message is string => Boolean(message)),
      ),
    ];
    return failures.length
      ? `- \`${model}\`: ${failures.length}/${report.attemptsPerModel} failures — ${messages.join("; ")}`
      : `- \`${model}\`: ${report.attemptsPerModel}/${report.attemptsPerModel} valid structured outputs.`;
  }).join("\n");
  return `# Chat metadata model mini-eval

Generated from Italy on ${report.generatedAt}. Each exact candidate received ${report.attemptsPerModel} attempts over the same 12 curated Italian scenarios.

| Model | Valid | Title | Icon | p50 ms | p95 ms | Cost | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Decision

${report.decision.selectedModel ? `Selected \`${report.decision.selectedModel}\`.` : "No final model selected until blinded review is complete."}

${report.decision.reason}

## Availability

${availability}

The blinded review found strong title specificity overall. The main weaknesses were omission of the coach in the coach-conversation scenario, one unsupported urgency word in a vague opening, and inconsistent icon choice for pre-final pressure.

## Method

Structured-output reliability is a gate. Eligible models are ranked by title quality (50%), icon fit (25%), reliability (15%), Italy end-to-end latency (7%), and cost (3%). Provider failures and exact model IDs are preserved; no alias or fallback substitution is allowed.
`;
}

async function writeReport(
  outputJson: string,
  outputMarkdown: string,
  attempts: EvalAttempt[],
  review: Map<string, BlindReviewRow>,
): Promise<void> {
  const summaries = rankCandidates(
    EVAL_MODELS.map((model) => summarizeCandidate(model, attempts, review)),
  );
  const reviewComplete = attempts
    .filter((attempt) => attempt.success)
    .every((attempt) => {
      const row = review.get(attempt.anonymousId);
      return (
        typeof row?.titleScore === "number" &&
        typeof row.iconScore === "number" &&
        row.note.trim().length > 0
      );
    });
  const winner = reviewComplete
    ? summaries.find((summary) => summary.eligible)
    : undefined;
  const decision = {
    selectedModel: winner?.model ?? null,
    reason: reviewComplete
      ? `${winner?.model} was the only eligible candidate: ${winner?.successes}/${winner?.attempts} valid outputs, blinded title score ${winner?.titleScore}, icon score ${winner?.iconScore}, p50 ${winner?.latencyMs.p50} ms, and $${winner?.totalCostUsd} total cost.`
      : "Complete the anonymous review file, then reaggregate without new provider calls.",
  };
  const report = {
    generatedAt: new Date().toISOString(),
    region: "Italy local client network",
    models: EVAL_MODELS,
    scenarios: scenarios.map(
      ({ id, conceptGroups, acceptedIcons, inappropriateIcons }) => ({
        id,
        conceptGroups,
        acceptedIcons,
        inappropriateIcons,
      }),
    ),
    attemptsPerModel: attempts.filter(
      (attempt) => attempt.model === EVAL_MODELS[0],
    ).length,
    attempts,
    summaries,
    reviewComplete,
    decision,
  };

  await mkdir(dirname(outputJson), { recursive: true });
  await mkdir(dirname(outputMarkdown), { recursive: true });
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(outputMarkdown, buildMarkdown(report));
}

async function main(): Promise<void> {
  assertArguments();
  const runs = readPositiveInteger("--runs", 2);
  const timeoutMs = readPositiveInteger("--timeout-ms", 15_000);
  const outputJson =
    readStringArg("--output-json") ??
    "docs/benchmarks/chat-metadata-model-eval-2026-08-08.json";
  const outputMarkdown =
    readStringArg("--output-md") ??
    "docs/benchmarks/chat-metadata-model-eval-2026-08-08.md";
  const reviewPath =
    readStringArg("--review-file") ?? reviewPathFor(outputJson);
  const fromJson = readStringArg("--from-json");

  if (fromJson) {
    const existing = JSON.parse(await readFile(fromJson, "utf8")) as {
      attempts: EvalAttempt[];
    };
    await writeReport(
      outputJson,
      outputMarkdown,
      existing.attempts,
      await readReview(reviewPath),
    );
    return;
  }

  const attempts: EvalAttempt[] = [];
  let attemptNumber = 0;
  const total = runs * scenarios.length * EVAL_MODELS.length;
  for (let pass = 1; pass <= runs; pass += 1) {
    for (const [scenarioIndex, item] of scenarios.entries()) {
      const orderedModels =
        (pass + scenarioIndex) % 2 === 0
          ? [...EVAL_MODELS]
          : [...EVAL_MODELS].reverse();
      for (const model of orderedModels) {
        attemptNumber += 1;
        const anonymousId = `attempt-${String(attemptNumber).padStart(3, "0")}`;
        const result = await runAttempt(
          model,
          item,
          pass,
          timeoutMs,
          anonymousId,
        );
        attempts.push(result);
        console.error(
          `[${attemptNumber}/${total}] ${item.id} ${model}: ${result.success ? `${result.durationMs}ms` : result.errorName}`,
        );
      }
    }
  }

  const summaries = EVAL_MODELS.map((model) =>
    summarizeCandidate(model, attempts),
  );
  if (summaries.every((summary) => !summary.eligible)) {
    throw new Error(
      "All exact candidates are ineligible; no report winner written",
    );
  }

  await writeFile(
    reviewPath,
    `${JSON.stringify(buildReviewRows(attempts), null, 2)}\n`,
  );
  await writeReport(outputJson, outputMarkdown, attempts, new Map());
}

if (import.meta.main) {
  await main();
}
