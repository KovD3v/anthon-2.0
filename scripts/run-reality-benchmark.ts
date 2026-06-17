import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDatabaseBackedRealityExecutor,
  PRELAUNCH_REALITY_SCENARIOS,
  runRealityBenchmark,
} from "../src/lib/benchmark/reality";
import {
  assertRealityBenchmarkDbMutationAllowed,
  describeDatabaseTargets,
  formatRealityBenchmarkReport,
  parseRealityBenchmarkArgs,
  REALITY_BENCHMARK_USAGE,
  sanitizeFileSegment,
  selectRealityScenarios,
  serializeRealityBenchmarkSummary,
} from "../src/lib/benchmark/reality-cli";

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
  const dbTargets = describeDatabaseTargets();

  console.log("Starting DB-backed reality benchmark");
  console.log(`Run label: ${config.runLabel}`);
  console.log(`Models: ${config.models.join(", ")}`);
  console.log(`Scenarios: ${scenarios.length}`);
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
    const summary = await runRealityBenchmark({
      models: config.models,
      scenarios,
      executor: benchmark.executor,
    });

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
      console.log(
        `${index + 1}. ${model.modelId}: score ${model.avgScore.toFixed(
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
