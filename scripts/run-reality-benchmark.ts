import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDatabaseBackedRealityExecutor,
  PRELAUNCH_REALITY_SCENARIOS,
  rescoreRealityBenchmarkSummary,
  runRealityBenchmark,
} from "../src/lib/benchmark/reality";
import {
  assertRealityBenchmarkDbMutationAllowed,
  describeDatabaseTargets,
  deserializeRealityBenchmarkSummary,
  formatRealityBenchmarkReport,
  parseRealityBenchmarkArgs,
  REALITY_BENCHMARK_USAGE,
  sanitizeFileSegment,
  selectRealityScenarios,
  serializeRealityBenchmarkSummary,
} from "../src/lib/benchmark/reality-cli";
import {
  judgeRealityBenchmarkSummary,
  refreshExistingRealityJudgeScores,
} from "../src/lib/benchmark/reality-judge";

async function main() {
  const config = parseRealityBenchmarkArgs(process.argv.slice(2));

  if (config.help) {
    console.log(REALITY_BENCHMARK_USAGE);
    return;
  }

  assertRealityBenchmarkDbMutationAllowed(config);

  const scenarios = selectRealityScenarios(
    PRELAUNCH_REALITY_SCENARIOS,
    config.scenarioIds,
  );
  const outputDir = path.resolve(process.cwd(), config.outputDir);
  const outputBase = sanitizeFileSegment(config.runLabel);
  const jsonPath = path.join(outputDir, `${outputBase}.json`);
  const markdownPath = path.join(outputDir, `${outputBase}.md`);

  if (config.judgeExistingPath) {
    await judgeExistingRun({
      inputPath: path.resolve(process.cwd(), config.judgeExistingPath),
      scenarios,
      judgeModels: config.judgeModels,
      judgeConcurrency: config.judgeConcurrency,
      rescoreHeuristic: config.rescoreHeuristic,
      outputDir,
    });
    return;
  }

  const dbTargets = describeDatabaseTargets();

  console.log("Starting DB-backed reality benchmark");
  console.log(`Run label: ${config.runLabel}`);
  console.log(`Models: ${config.models.join(", ")}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Model concurrency: ${config.modelConcurrency}`);
  if (config.judge) {
    console.log(`Judge models: ${config.judgeModels.join(", ")}`);
    console.log(`Judge concurrency: ${config.judgeConcurrency}`);
  }
  console.log(`Output: ${jsonPath}`);
  console.log(`DATABASE_URL: ${formatDatabaseTarget(dbTargets.databaseUrl)}`);
  console.log(
    `TEST_DATABASE_URL: ${formatDatabaseTarget(dbTargets.testDatabaseUrl)}`,
  );

  const benchmark = createDatabaseBackedRealityExecutor({
    runLabel: config.runLabel,
    isGuest: false,
    memoryEnabled: true,
    responseMode: "text",
  });

  try {
    let summary = await runRealityBenchmark({
      models: config.models,
      scenarios,
      executor: benchmark.executor,
      modelConcurrency: config.modelConcurrency,
    });

    if (config.judge) {
      console.log("Running LLM-as-a-judge scoring");
      summary = await judgeRealityBenchmarkSummary({
        summary,
        scenarios,
        judgeModels: config.judgeModels,
        judgeConcurrency: config.judgeConcurrency,
        onProgress: logJudgeProgress,
      });
    }

    await mkdir(outputDir, { recursive: true });
    await writeFile(
      jsonPath,
      `${JSON.stringify(serializeRealityBenchmarkSummary(summary), null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      markdownPath,
      formatRealityBenchmarkReport(summary, {
        runLabel: config.runLabel,
        scenarioCount: scenarios.length,
      }),
      "utf8",
    );

    console.log("");
    console.log("Reality benchmark summary");
    for (const [index, model] of summary.models.entries()) {
      const score = model.avgBlendedScore ?? model.avgScore;
      const scoreLabel =
        model.avgBlendedScore !== undefined ? "blended" : "score";
      console.log(
        `${index + 1}. ${model.modelId}: ${scoreLabel} ${score.toFixed(
          2,
        )}/10, latency ${Math.round(
          model.avgLatencyMs,
        )}ms, cost $${model.totalCostUsd.toFixed(6)}`,
      );
    }
    console.log(`JSON report: ${jsonPath}`);
    console.log(`Markdown report: ${markdownPath}`);
  } finally {
    if (config.keepData) {
      console.log("Keeping benchmark DB records because --keep-data was set.");
    } else {
      await benchmark.cleanup();
      console.log("Cleaned up benchmark DB records.");
    }
  }
}

async function judgeExistingRun({
  inputPath,
  scenarios,
  judgeModels,
  judgeConcurrency,
  rescoreHeuristic,
  outputDir,
}: {
  inputPath: string;
  scenarios: typeof PRELAUNCH_REALITY_SCENARIOS;
  judgeModels: string[];
  judgeConcurrency: number;
  rescoreHeuristic: boolean;
  outputDir: string;
}) {
  console.log("Starting judge-only reality benchmark scoring");
  console.log(`Input: ${inputPath}`);
  console.log(`Judge models: ${judgeModels.join(", ")}`);
  console.log(`Judge concurrency: ${judgeConcurrency}`);
  if (rescoreHeuristic) {
    console.log("Rescoring existing run with current heuristic before judge");
  }

  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const summary = rescoreHeuristic
    ? rescoreRealityBenchmarkSummary(
        deserializeRealityBenchmarkSummary(input),
        scenarios,
      )
    : deserializeRealityBenchmarkSummary(input);
  const judgedSummary = hasCompleteJudgeScores(summary)
    ? refreshExistingRealityJudgeScores(summary)
    : await judgeRealityBenchmarkSummary({
        summary,
        scenarios,
        judgeModels,
        judgeConcurrency,
        onProgress: logJudgeProgress,
      });
  if (hasCompleteJudgeScores(summary)) {
    console.log("Reused existing judge scores from input JSON");
  }
  const inputBase = path.basename(inputPath, path.extname(inputPath));
  const sanitizedInputBase = sanitizeFileSegment(inputBase);
  const outputBase = sanitizedInputBase.endsWith("-judged")
    ? sanitizedInputBase
    : `${sanitizedInputBase}-judged`;
  const jsonPath = path.join(outputDir, `${outputBase}.json`);
  const markdownPath = path.join(outputDir, `${outputBase}.md`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    jsonPath,
    `${JSON.stringify(serializeRealityBenchmarkSummary(judgedSummary), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    markdownPath,
    formatRealityBenchmarkReport(judgedSummary, {
      runLabel: outputBase,
      scenarioCount: countSummaryScenarios(judgedSummary),
    }),
    "utf8",
  );

  console.log("");
  console.log("Judge-only reality benchmark summary");
  for (const [index, model] of judgedSummary.models.entries()) {
    console.log(
      `${index + 1}. ${model.modelId}: blended ${(
        model.avgBlendedScore ?? model.avgScore
      ).toFixed(2)}/10, judge ${(model.avgJudgeScore ?? 0).toFixed(2)}/10`,
    );
  }
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${markdownPath}`);
}

function hasCompleteJudgeScores(summary: {
  results: Array<{ judge?: unknown }>;
}) {
  return (
    summary.results.length > 0 &&
    summary.results.every((result) => result.judge)
  );
}

function countSummaryScenarios(summary: {
  results: Array<{ scenarioId: string }>;
}) {
  return new Set(summary.results.map((result) => result.scenarioId)).size;
}

function formatDatabaseTarget(
  target:
    | { configured: false }
    | { configured: true; host: string; database: string | null }
    | { configured: true; invalid: true },
) {
  if (!target.configured) {
    return "unset";
  }

  if ("invalid" in target) {
    return "set but invalid";
  }

  return `set host=${target.host} db=${target.database ?? ""}`;
}

function logJudgeProgress({
  completed,
  total,
  result,
}: {
  completed: number;
  total: number;
  result: {
    modelId: string;
    scenarioId: string;
    turnIndex: number;
  };
}) {
  console.log(
    `Judged ${completed}/${total}: ${result.modelId} ${result.scenarioId}#${result.turnIndex}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
