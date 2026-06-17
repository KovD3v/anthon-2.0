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
];

export type RealityBenchmarkCliConfig = {
  help: boolean;
  models: string[];
  runLabel: string;
  outputDir: string;
  scenarioIds: string[];
  allowDbMutation: boolean;
  keepData: boolean;
  judge: boolean;
  judgeModels: string[];
  judgeExistingPath: string | null;
  rescoreHeuristic: boolean;
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
    judge: false,
    judgeModels: [...DEFAULT_REALITY_JUDGE_MODELS],
    judgeExistingPath: null,
    rescoreHeuristic: false,
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

    if (arg === "--rescore-heuristic") {
      config.rescoreHeuristic = true;
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
    ? "| Rank | Model | Blended score | Judge score | Heuristic score | Judge flags | Avg latency | Avg cost | Total cost | Safety failures |"
    : "| Rank | Model | Avg score | Avg latency | Avg cost | Total cost | Safety failures |";
  const rankingDivider = hasJudgeScores
    ? "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
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
          `$${formatNumber(model.avgCostUsd, 6)}`,
          `$${formatNumber(model.totalCostUsd, 6)}`,
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
  --judge                    Add LLM-as-a-judge scoring after candidate run.
  --judge-existing <path>    Add judge scores to an existing JSON run without DB mutation.
  --judge-models <ids>       Exactly two comma-separated judge model ids.
  --rescore-heuristic        Recompute current heuristic scores before judging an existing run.
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
