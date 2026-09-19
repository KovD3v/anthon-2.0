import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { planRecall } from "@/lib/ai/recall-planner";
import fixtures from "@/lib/benchmark/fixtures/memory-recall.json";
import {
  type MemoryRecallBenchmarkObservation,
  scoreMemoryRecallBenchmark,
} from "@/lib/benchmark/memory-recall";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--planner-only")) {
  throw new Error(
    "Usage: bun run benchmark:memory-recall [--planner-only]. This command never connects to a database or model.",
  );
}

const observations: MemoryRecallBenchmarkObservation[] = fixtures.scenarios.map(
  (scenario) => {
    const started = performance.now();
    const plan = planRecall({
      message: scenario.message,
      decision: { mode: "active", reason: "benchmark" },
      isGuest: false,
    });
    return {
      expectedRecall: scenario.expectedRecall,
      recalled: plan.facts.enabled || plan.conversations.enabled,
      expectedFacts: null,
      returnedFacts: null,
      evidenceRelevant: null,
      duplicateCount: null,
      conflictCorrect: null,
      unsupportedClaim: null,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      costUsd: 0,
    };
  },
);

let offlineRetrieval: unknown = null;
if (!args.includes("--planner-only")) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "anthon-memory-benchmark-"),
  );
  try {
    const reportPath = path.join(directory, "report.json");
    await promisify(execFile)(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "src/lib/benchmark/memory-recall-offline.test.ts",
      ],
      {
        env: { ...process.env, ANTHON_MEMORY_BENCHMARK_REPORT: reportPath },
        timeout: 60_000,
      },
    );
    offlineRetrieval = JSON.parse(await readFile(reportPath, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

console.info(
  JSON.stringify(
    {
      period: "offline synthetic evaluation",
      fixtureVersion: fixtures.version,
      filters: { scenarioCount: fixtures.scenarios.length },
      source: "fictionalized-offline-fixtures",
      externalMutationsAllowed: false,
      plannerOnly: {
        definitions: {
          usefulActionRecall:
            "share of recall-needed scenarios where recall was planned",
          unnecessaryActionRate:
            "share of control scenarios where recall was planned",
          unsupportedMemoryClaimRate:
            "share of scenarios containing an unsupported memory claim",
        },
        metrics: scoreMemoryRecallBenchmark(observations),
      },
      offlineRetrieval,
      generatedAnswers: {
        status: "not_evaluated",
        unsupportedMemoryClaimRate: null,
      },
    },
    null,
    2,
  ),
);
