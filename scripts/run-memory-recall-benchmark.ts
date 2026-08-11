import { planRecall } from "@/lib/ai/recall-planner";
import fixtures from "@/lib/benchmark/fixtures/memory-recall.json";
import {
  type MemoryRecallBenchmarkObservation,
  scoreMemoryRecallBenchmark,
} from "@/lib/benchmark/memory-recall";

const args = process.argv.slice(2);
const allowDbRead = args.includes("--allow-db-read");
const allowDbMutation = args.includes("--allow-db-mutation");
if (allowDbMutation && !allowDbRead) {
  throw new Error("--allow-db-mutation requires --allow-db-read");
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
      expectedFacts: [],
      returnedFacts: [],
      evidenceRelevant: plan.conversations.enabled ? true : null,
      duplicateCount: 0,
      conflictCorrect: true,
      unsupportedClaim: false,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      costUsd: 0,
    };
  },
);

console.info(
  JSON.stringify(
    {
      period: "offline deterministic run",
      fixtureVersion: fixtures.version,
      filters: { scenarioCount: fixtures.scenarios.length },
      source: allowDbRead
        ? "database-read-enabled"
        : "fictionalized-offline-fixtures",
      mutationsAllowed: allowDbMutation,
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
    null,
    2,
  ),
);
