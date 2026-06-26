import { OPENROUTER_PROVIDER_ROUTING_ENV } from "@/lib/ai/providers/openrouter-routing";
import type { RealityBenchmarkSummary, RealityScenario } from "./reality";
import {
  assertTwoJudgeModels,
  DEFAULT_REALITY_JUDGE_MODELS,
} from "./reality-judge";

export const REALITY_BENCHMARK_DB_MUTATION_ENV =
  "REALITY_BENCHMARK_ALLOW_DB_MUTATION";

export const DEFAULT_REALITY_BENCHMARK_MODELS = [
  "openai/gpt-chat-latest",
  "moonshotai/kimi-k2.7-code",
  "z-ai/glm-5.2",
  "z-ai/glm-4.7",
  "stepfun/step-3.7-flash",
  "minimax/minimax-m3",
  "tencent/hy3-preview",
];

export type RealityBenchmarkCliConfig = {
  help: boolean;
  models: string[];
  runLabel: string;
  outputDir: string;
  scenarioIds: string[];
  allowDbMutation: boolean;
  keepData: boolean;
  modelConcurrency: number;
  judge: boolean;
  judgeModels: string[];
  judgeConcurrency: number;
  judgeExistingPath: string | null;
  rescoreHeuristic: boolean;
  openRouterProviderSort: string | null;
  openRouterProviderOrder: string[];
  openRouterProviderOnly: string[];
  openRouterProviderIgnore: string[];
  openRouterProviderAllowFallbacks: boolean | null;
  openRouterProviderE2eMetrics: string | null;
  openRouterProviderCostMetrics: string | null;
  openRouterProviderE2eInputTokens: number | null;
  openRouterProviderE2eOutputTokens: number | null;
  openRouterProviderE2eMaxSeconds: number | null;
  openRouterProviderE2eCostWeight: number | null;
};

type Env = Record<string, string | undefined>;

export function parseRealityBenchmarkArgs(
  argv: string[],
  now = new Date(),
): RealityBenchmarkCliConfig {
  const config: RealityBenchmarkCliConfig = {
    help: false,
    models: [...DEFAULT_REALITY_BENCHMARK_MODELS],
    runLabel: `reality-${formatTimestamp(now)}`,
    outputDir: "docs/benchmarks/runs",
    scenarioIds: [],
    allowDbMutation: false,
    keepData: false,
    modelConcurrency: 1,
    judge: false,
    judgeModels: [...DEFAULT_REALITY_JUDGE_MODELS],
    judgeConcurrency: 1,
    judgeExistingPath: null,
    rescoreHeuristic: false,
    openRouterProviderSort: null,
    openRouterProviderOrder: [],
    openRouterProviderOnly: [],
    openRouterProviderIgnore: [],
    openRouterProviderAllowFallbacks: null,
    openRouterProviderE2eMetrics: null,
    openRouterProviderCostMetrics: null,
    openRouterProviderE2eInputTokens: null,
    openRouterProviderE2eOutputTokens: null,
    openRouterProviderE2eMaxSeconds: null,
    openRouterProviderE2eCostWeight: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      config.help = true;
      continue;
    }

    if (arg === "--allow-db-mutation") {
      config.allowDbMutation = true;
      continue;
    }

    if (arg === "--keep-data") {
      config.keepData = true;
      continue;
    }

    if (arg === "--judge") {
      config.judge = true;
      continue;
    }

    if (arg.startsWith("--model-concurrency=")) {
      config.modelConcurrency = parsePositiveInteger(
        arg.slice("--model-concurrency=".length),
        "--model-concurrency",
      );
      continue;
    }

    if (arg === "--model-concurrency") {
      config.modelConcurrency = parsePositiveInteger(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--judge-concurrency=")) {
      config.judgeConcurrency = parsePositiveInteger(
        arg.slice("--judge-concurrency=".length),
        "--judge-concurrency",
      );
      continue;
    }

    if (arg === "--judge-concurrency") {
      config.judgeConcurrency = parsePositiveInteger(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg === "--rescore-heuristic") {
      config.rescoreHeuristic = true;
      continue;
    }

    if (arg.startsWith("--openrouter-provider-sort=")) {
      config.openRouterProviderSort = parseValue(
        arg.slice("--openrouter-provider-sort=".length),
        "--openrouter-provider-sort",
      );
      continue;
    }

    if (arg === "--openrouter-provider-sort") {
      config.openRouterProviderSort = parseValue(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-order=")) {
      config.openRouterProviderOrder = parseList(
        arg.slice("--openrouter-provider-order=".length),
        "--openrouter-provider-order",
      );
      continue;
    }

    if (arg === "--openrouter-provider-order") {
      config.openRouterProviderOrder = parseList(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-only=")) {
      config.openRouterProviderOnly = parseList(
        arg.slice("--openrouter-provider-only=".length),
        "--openrouter-provider-only",
      );
      continue;
    }

    if (arg === "--openrouter-provider-only") {
      config.openRouterProviderOnly = parseList(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-ignore=")) {
      config.openRouterProviderIgnore = parseList(
        arg.slice("--openrouter-provider-ignore=".length),
        "--openrouter-provider-ignore",
      );
      continue;
    }

    if (arg === "--openrouter-provider-ignore") {
      config.openRouterProviderIgnore = parseList(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-allow-fallbacks=")) {
      config.openRouterProviderAllowFallbacks = parseBoolean(
        arg.slice("--openrouter-provider-allow-fallbacks=".length),
        "--openrouter-provider-allow-fallbacks",
      );
      continue;
    }

    if (arg === "--openrouter-provider-allow-fallbacks") {
      config.openRouterProviderAllowFallbacks = parseBoolean(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-e2e-metrics=")) {
      config.openRouterProviderE2eMetrics = parseValue(
        arg.slice("--openrouter-provider-e2e-metrics=".length),
        "--openrouter-provider-e2e-metrics",
      );
      continue;
    }

    if (arg === "--openrouter-provider-e2e-metrics") {
      config.openRouterProviderE2eMetrics = parseValue(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-cost-metrics=")) {
      config.openRouterProviderCostMetrics = parseValue(
        arg.slice("--openrouter-provider-cost-metrics=".length),
        "--openrouter-provider-cost-metrics",
      );
      continue;
    }

    if (arg === "--openrouter-provider-cost-metrics") {
      config.openRouterProviderCostMetrics = parseValue(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-e2e-input-tokens=")) {
      config.openRouterProviderE2eInputTokens = parsePositiveInteger(
        arg.slice("--openrouter-provider-e2e-input-tokens=".length),
        "--openrouter-provider-e2e-input-tokens",
      );
      continue;
    }

    if (arg === "--openrouter-provider-e2e-input-tokens") {
      config.openRouterProviderE2eInputTokens = parsePositiveInteger(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-e2e-output-tokens=")) {
      config.openRouterProviderE2eOutputTokens = parsePositiveInteger(
        arg.slice("--openrouter-provider-e2e-output-tokens=".length),
        "--openrouter-provider-e2e-output-tokens",
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-e2e-max-seconds=")) {
      config.openRouterProviderE2eMaxSeconds = parsePositiveNumber(
        arg.slice("--openrouter-provider-e2e-max-seconds=".length),
        "--openrouter-provider-e2e-max-seconds",
      );
      continue;
    }

    if (arg === "--openrouter-provider-e2e-max-seconds") {
      config.openRouterProviderE2eMaxSeconds = parsePositiveNumber(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--openrouter-provider-e2e-cost-weight=")) {
      config.openRouterProviderE2eCostWeight = parsePositiveNumber(
        arg.slice("--openrouter-provider-e2e-cost-weight=".length),
        "--openrouter-provider-e2e-cost-weight",
      );
      continue;
    }

    if (arg === "--openrouter-provider-e2e-cost-weight") {
      config.openRouterProviderE2eCostWeight = parsePositiveNumber(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg === "--openrouter-provider-e2e-output-tokens") {
      config.openRouterProviderE2eOutputTokens = parsePositiveInteger(
        readNextValue(argv, ++i, arg),
        arg,
      );
      continue;
    }

    if (arg.startsWith("--judge-models=")) {
      config.judgeModels = parseList(
        arg.slice("--judge-models=".length),
        "--judge-models",
      );
      config.judge = true;
      continue;
    }

    if (arg === "--judge-models") {
      config.judgeModels = parseList(readNextValue(argv, ++i, arg), arg);
      config.judge = true;
      continue;
    }

    if (arg.startsWith("--judge-existing=")) {
      config.judgeExistingPath = parseValue(
        arg.slice("--judge-existing=".length),
        "--judge-existing",
      );
      config.judge = true;
      continue;
    }

    if (arg === "--judge-existing") {
      config.judgeExistingPath = parseValue(readNextValue(argv, ++i, arg), arg);
      config.judge = true;
      continue;
    }

    if (arg.startsWith("--models=")) {
      config.models = parseList(arg.slice("--models=".length), "--models");
      continue;
    }

    if (arg === "--models") {
      config.models = parseList(readNextValue(argv, ++i, arg), arg);
      continue;
    }

    if (arg.startsWith("--run-label=")) {
      config.runLabel = parseValue(
        arg.slice("--run-label=".length),
        "--run-label",
      );
      continue;
    }

    if (arg === "--run-label") {
      config.runLabel = parseValue(readNextValue(argv, ++i, arg), arg);
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      config.outputDir = parseValue(
        arg.slice("--output-dir=".length),
        "--output-dir",
      );
      continue;
    }

    if (arg === "--output-dir") {
      config.outputDir = parseValue(readNextValue(argv, ++i, arg), arg);
      continue;
    }

    if (arg.startsWith("--scenarios=")) {
      config.scenarioIds = parseList(
        arg.slice("--scenarios=".length),
        "--scenarios",
      );
      continue;
    }

    if (arg === "--scenarios") {
      config.scenarioIds = parseList(readNextValue(argv, ++i, arg), arg);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (config.models.length === 0) {
    throw new Error("At least one model is required.");
  }

  if (config.judge) {
    assertTwoJudgeModels(config.judgeModels);
  }

  return config;
}

export function applyOpenRouterProviderRoutingEnv(
  config: Pick<
    RealityBenchmarkCliConfig,
    | "openRouterProviderSort"
    | "openRouterProviderOrder"
    | "openRouterProviderOnly"
    | "openRouterProviderIgnore"
    | "openRouterProviderAllowFallbacks"
    | "openRouterProviderE2eMetrics"
    | "openRouterProviderCostMetrics"
    | "openRouterProviderE2eInputTokens"
    | "openRouterProviderE2eOutputTokens"
    | "openRouterProviderE2eMaxSeconds"
    | "openRouterProviderE2eCostWeight"
  >,
  env: Env = process.env,
) {
  if (config.openRouterProviderSort) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.sort] = config.openRouterProviderSort;
  }

  if (config.openRouterProviderOrder.length > 0) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.order] =
      config.openRouterProviderOrder.join(",");
  }

  if (config.openRouterProviderOnly.length > 0) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.only] =
      config.openRouterProviderOnly.join(",");
  }

  if (config.openRouterProviderIgnore.length > 0) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.ignore] =
      config.openRouterProviderIgnore.join(",");
  }

  if (config.openRouterProviderAllowFallbacks !== null) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.allowFallbacks] = String(
      config.openRouterProviderAllowFallbacks,
    );
  }

  if (config.openRouterProviderE2eMetrics) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics] =
      config.openRouterProviderE2eMetrics;
  }

  if (config.openRouterProviderCostMetrics) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.costMetrics] =
      config.openRouterProviderCostMetrics;
  }

  if (config.openRouterProviderE2eInputTokens !== null) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eInputTokens] = String(
      config.openRouterProviderE2eInputTokens,
    );
  }

  if (config.openRouterProviderE2eOutputTokens !== null) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eOutputTokens] = String(
      config.openRouterProviderE2eOutputTokens,
    );
  }

  if (config.openRouterProviderE2eMaxSeconds !== null) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eMaxSeconds] = String(
      config.openRouterProviderE2eMaxSeconds,
    );
  }

  if (config.openRouterProviderE2eCostWeight !== null) {
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eCostWeight] = String(
      config.openRouterProviderE2eCostWeight,
    );
  }
}

export function assertRealityBenchmarkDbMutationAllowed(
  config: Pick<
    RealityBenchmarkCliConfig,
    "allowDbMutation" | "help" | "judgeExistingPath"
  >,
  env: Env = process.env,
) {
  if (config.help) {
    return;
  }

  if (config.judgeExistingPath) {
    return;
  }

  if (
    config.allowDbMutation ||
    env[REALITY_BENCHMARK_DB_MUTATION_ENV] === "1"
  ) {
    return;
  }

  throw new Error(
    `Refusing to run DB-backed reality benchmark without explicit approval. Pass --allow-db-mutation or set ${REALITY_BENCHMARK_DB_MUTATION_ENV}=1.`,
  );
}

export function selectRealityScenarios(
  scenarios: RealityScenario[],
  scenarioIds: string[],
) {
  if (scenarioIds.length === 0) {
    return scenarios;
  }

  const selected = scenarios.filter((scenario) =>
    scenarioIds.includes(scenario.id),
  );
  const selectedIds = new Set(selected.map((scenario) => scenario.id));
  const missing = scenarioIds.filter(
    (scenarioId) => !selectedIds.has(scenarioId),
  );

  if (missing.length > 0) {
    throw new Error(`Unknown scenario id(s): ${missing.join(", ")}`);
  }

  return selected;
}

export function serializeRealityBenchmarkSummary(
  summary: RealityBenchmarkSummary,
) {
  return {
    startedAt: summary.startedAt.toISOString(),
    endedAt: summary.endedAt.toISOString(),
    durationMs: summary.endedAt.getTime() - summary.startedAt.getTime(),
    models: summary.models,
    results: summary.results,
  };
}

export function deserializeRealityBenchmarkSummary(
  value: ReturnType<typeof serializeRealityBenchmarkSummary>,
): RealityBenchmarkSummary {
  return {
    ...value,
    startedAt: new Date(value.startedAt),
    endedAt: new Date(value.endedAt),
  };
}

export function formatRealityBenchmarkReport(
  summary: RealityBenchmarkSummary,
  options: { runLabel: string; scenarioCount: number },
) {
  const hasJudgeScores = summary.models.some(
    (model) => model.avgJudgeScore !== undefined,
  );
  const rankingColumns = hasJudgeScores
    ? "| Rank | Model | Blended score | Judge score | Heuristic score | Judge flags | Avg latency | Candidate cost | Judge cost | Total cost | Safety failures |"
    : "| Rank | Model | Avg score | Avg latency | Avg cost | Total cost | Safety failures |";
  const rankingDivider = hasJudgeScores
    ? "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    : "| ---: | --- | ---: | ---: | ---: | ---: | ---: |";
  const lines = [
    "# Reality Benchmark Run",
    "",
    `- Run label: ${options.runLabel}`,
    `- Started: ${summary.startedAt.toISOString()}`,
    `- Ended: ${summary.endedAt.toISOString()}`,
    `- Duration: ${formatDuration(
      summary.endedAt.getTime() - summary.startedAt.getTime(),
    )}`,
    `- Scenarios: ${options.scenarioCount}`,
    `- Turns: ${summary.results.length}`,
    "",
    rankingColumns,
    rankingDivider,
  ];

  for (const [index, model] of summary.models.entries()) {
    if (hasJudgeScores) {
      lines.push(
        `${[
          `| ${index + 1}`,
          model.modelId,
          formatNumber(model.avgBlendedScore ?? model.avgScore, 2),
          formatNumber(model.avgJudgeScore ?? 0, 2),
          formatNumber(model.avgScore, 2),
          String(model.judgeFlags ?? 0),
          `${Math.round(model.avgLatencyMs)} ms`,
          `$${formatNumber(model.totalCostUsd, 6)}`,
          `$${formatNumber(model.totalJudgeCostUsd ?? 0, 6)}`,
          `$${formatNumber(model.totalRunCostUsd ?? model.totalCostUsd, 6)}`,
          String(model.safetyFailures),
        ].join(" | ")} |`,
      );
    } else {
      lines.push(
        `${[
          `| ${index + 1}`,
          model.modelId,
          formatNumber(model.avgScore, 2),
          `${Math.round(model.avgLatencyMs)} ms`,
          `$${formatNumber(model.avgCostUsd, 6)}`,
          `$${formatNumber(model.totalCostUsd, 6)}`,
          String(model.safetyFailures),
        ].join(" | ")} |`,
      );
    }
  }

  if (summary.models.some((model) => model.avgDimensions)) {
    lines.push(
      "",
      "## Dimension Averages",
      "",
      "| Model | Safety | Memory/context | Concision | Coaching usefulness | Mobile/voice | Hallucination resistance | Follow-up judgment |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );

    for (const model of summary.models) {
      const dimensions = model.avgDimensions;
      if (!dimensions) continue;
      lines.push(
        `${[
          `| ${model.modelId}`,
          formatNumber(dimensions.safety, 2),
          formatNumber(dimensions.memoryContext, 2),
          formatNumber(dimensions.concision, 2),
          formatNumber(dimensions.coachingUsefulness, 2),
          formatNumber(dimensions.mobileVoiceSuitability, 2),
          formatNumber(dimensions.hallucinationResistance, 2),
          formatNumber(dimensions.followUpJudgment, 2),
        ].join(" | ")} |`,
      );
    }
  }

  if (hasJudgeScores) {
    lines.push(
      "",
      "## Judge Turn Diagnostics",
      "",
      "| Model | Scenario | Turn | Heuristic | Judge | Disagreement | Flagged | Forbidden | Key weakness |",
      "| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |",
    );

    for (const result of summary.results) {
      const judge = result.judge;
      if (!judge) continue;
      const firstWeakness =
        judge.judges.flatMap((modelJudge) => modelJudge.weaknesses)[0] ?? "";
      lines.push(
        `${[
          `| ${result.modelId}`,
          result.scenarioId,
          String(result.turnIndex + 1),
          formatNumber(result.score.score, 2),
          formatNumber(judge.consensusScore, 2),
          formatNumber(judge.disagreement, 2),
          judge.flaggedForReview ? "yes" : "no",
          result.score.matchedForbiddenSignals.join(", "),
          firstWeakness.replace(/\|/g, "/"),
        ].join(" | ")} |`,
      );
    }
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function sanitizeFileSegment(value: string) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "reality-benchmark";
}

export function describeDatabaseTargets(env: Env = process.env) {
  return {
    databaseUrl: describeDatabaseUrl(env.DATABASE_URL),
    testDatabaseUrl: describeDatabaseUrl(env.TEST_DATABASE_URL),
  };
}

export const REALITY_BENCHMARK_USAGE = `Usage:
  bun run scripts/run-reality-benchmark.ts --allow-db-mutation

Options:
  --models <ids>             Comma-separated OpenRouter model ids.
  --run-label <label>        Label used in DB metadata and output filenames.
  --output-dir <path>        Directory for JSON and Markdown reports.
  --scenarios <ids>          Comma-separated scenario ids for a partial run.
  --model-concurrency <n>    Number of candidate models to run in parallel. Default: 1.
  --judge                    Add LLM-as-a-judge scoring after candidate run.
  --judge-existing <path>    Add judge scores to an existing JSON run without DB mutation.
  --judge-models <ids>       Exactly two comma-separated judge model ids.
  --judge-concurrency <n>    Number of judge calls to run in parallel. Default: 1.
  --rescore-heuristic        Recompute current heuristic scores before judging an existing run.
  --openrouter-provider-sort <sort>
                             OpenRouter provider sort strategy. Use e2e-latency for lowest total round-trip latency.
  --openrouter-provider-order <providers>
                             Comma-separated provider preference order for diagnostics.
  --openrouter-provider-only <providers>
                             Comma-separated allowed providers for diagnostics.
  --openrouter-provider-ignore <providers>
                             Comma-separated ignored providers for diagnostics.
  --openrouter-provider-allow-fallbacks <bool>
                             Whether OpenRouter may fall back from requested providers.
  --openrouter-provider-e2e-metrics <rows>
                             Provider rows: provider:e2eLatencySeconds, modelId=provider:e2eLatencySeconds, provider:latencySeconds:throughputTokensPerSecond[:e2eLatencySeconds], or modelId=provider:latencySeconds:throughputTokensPerSecond[:e2eLatencySeconds].
  --openrouter-provider-cost-metrics <rows>
                             Provider cost rows: provider:inputCostPerToken:outputCostPerToken or modelId=provider:inputCostPerToken:outputCostPerToken.
  --openrouter-provider-e2e-input-tokens <n>
                             Expected input tokens for cost-aware E2E routing.
  --openrouter-provider-e2e-output-tokens <n>
                             Expected output tokens for estimated E2E latency when rows omit e2eLatencySeconds.
  --openrouter-provider-e2e-max-seconds <n>
                             Exclude providers above this E2E latency if at least one provider remains.
  --openrouter-provider-e2e-cost-weight <n>
                             Seconds of latency penalty per $1 estimated request cost. Default: 100.
  --allow-db-mutation        Required unless ${REALITY_BENCHMARK_DB_MUTATION_ENV}=1.
  --keep-data                Do not delete benchmark users/chats after the run.
  --help                     Show this help.
`;

function parseList(value: string, flag: string) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`${flag} requires at least one value.`);
  }

  return items;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }

  return parsed;
}

function parsePositiveNumber(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number.`);
  }

  return parsed;
}

function parseBoolean(value: string, flag: string) {
  const normalized = parseValue(value, flag).toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }
  throw new Error(`${flag} requires a boolean value.`);
}

function readNextValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseValue(value: string, flag: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flag} requires a value.`);
  }
  return trimmed;
}

function formatTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:]/g, "-");
}

function formatNumber(value: number, decimals: number) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

function formatDuration(durationMs: number) {
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${formatNumber(seconds, 1)}s`;
  }

  return `${formatNumber(seconds / 60, 1)}m`;
}

function describeDatabaseUrl(value: string | undefined) {
  if (!value) {
    return { configured: false as const };
  }

  try {
    const url = new URL(value);
    return {
      configured: true as const,
      host: url.hostname,
      database: url.pathname.slice(1) || null,
    };
  } catch {
    return { configured: true as const, invalid: true as const };
  }
}
