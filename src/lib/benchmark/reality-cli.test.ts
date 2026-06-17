import { describe, expect, it } from "vitest";
import type { RealityScenario } from "./reality";
import {
  assertRealityBenchmarkDbMutationAllowed,
  DEFAULT_REALITY_BENCHMARK_MODELS,
  formatRealityBenchmarkReport,
  parseRealityBenchmarkArgs,
  REALITY_BENCHMARK_DB_MUTATION_ENV,
  selectRealityScenarios,
} from "./reality-cli";

describe("benchmark/reality-cli", () => {
  it("defaults to the current candidate model list", () => {
    const config = parseRealityBenchmarkArgs(
      [],
      new Date("2026-06-17T10:00:00.000Z"),
    );

    expect(config.models).toEqual(DEFAULT_REALITY_BENCHMARK_MODELS);
    expect(config.runLabel).toBe("reality-2026-06-17T10-00-00Z");
    expect(config.outputDir).toBe("docs/benchmarks/runs");
  });

  it("parses explicit models, label, output dir, and scenarios", () => {
    const config = parseRealityBenchmarkArgs([
      "--models",
      "model-a, model-b",
      "--run-label=launch-check",
      "--output-dir",
      "tmp/benchmarks",
      "--scenarios=scenario-a,scenario-b",
      "--judge",
      "--judge-models",
      "judge-a, judge-b",
      "--model-concurrency=3",
      "--judge-concurrency",
      "4",
      "--allow-db-mutation",
      "--keep-data",
    ]);

    expect(config).toMatchObject({
      models: ["model-a", "model-b"],
      runLabel: "launch-check",
      outputDir: "tmp/benchmarks",
      scenarioIds: ["scenario-a", "scenario-b"],
      judge: true,
      judgeModels: ["judge-a", "judge-b"],
      modelConcurrency: 3,
      judgeConcurrency: 4,
      allowDbMutation: true,
      keepData: true,
    });
  });

  it("rejects invalid concurrency values", () => {
    expect(() =>
      parseRealityBenchmarkArgs(["--model-concurrency", "0"]),
    ).toThrow(/positive integer/);
    expect(() => parseRealityBenchmarkArgs(["--judge-concurrency=-1"])).toThrow(
      /positive integer/,
    );
  });

  it("parses judge-existing without requiring DB mutation approval", () => {
    const config = parseRealityBenchmarkArgs([
      "--judge-existing",
      "docs/benchmarks/runs/run.json",
      "--rescore-heuristic",
    ]);

    expect(config).toMatchObject({
      judge: true,
      judgeExistingPath: "docs/benchmarks/runs/run.json",
      rescoreHeuristic: true,
    });
    expect(() =>
      assertRealityBenchmarkDbMutationAllowed(config, {}),
    ).not.toThrow();
  });

  it("requires exactly two judge models", () => {
    expect(() =>
      parseRealityBenchmarkArgs(["--judge-models", "judge-a"]),
    ).toThrow(/exactly two/);
    expect(() =>
      parseRealityBenchmarkArgs(["--judge-models", "judge-a,judge-b,judge-c"]),
    ).toThrow(/exactly two/);
  });

  it("requires explicit DB mutation approval", () => {
    const config = parseRealityBenchmarkArgs([]);

    expect(() => assertRealityBenchmarkDbMutationAllowed(config, {})).toThrow(
      /without explicit approval/,
    );

    expect(() =>
      assertRealityBenchmarkDbMutationAllowed(config, {
        [REALITY_BENCHMARK_DB_MUTATION_ENV]: "1",
      }),
    ).not.toThrow();
  });

  it("selects scenarios by id and rejects missing ids", () => {
    const scenarios = [
      { id: "scenario-a" },
      { id: "scenario-b" },
    ] as RealityScenario[];

    expect(selectRealityScenarios(scenarios, ["scenario-b"])).toEqual([
      { id: "scenario-b" },
    ]);
    expect(() => selectRealityScenarios(scenarios, ["missing"])).toThrow(
      /Unknown scenario/,
    );
  });

  it("prints dimension averages when reality score dimensions are available", () => {
    const report = formatRealityBenchmarkReport(
      {
        startedAt: new Date("2026-06-17T10:00:00.000Z"),
        endedAt: new Date("2026-06-17T10:01:00.000Z"),
        models: [
          {
            modelId: "model-a",
            scenarioCount: 1,
            turnCount: 1,
            avgScore: 8,
            avgLatencyMs: 1000,
            avgCostUsd: 0,
            totalCostUsd: 0,
            totalInputTokens: 10,
            totalOutputTokens: 20,
            safetyFailures: 0,
            avgDimensions: {
              safety: 10,
              memoryContext: 7,
              concision: 8,
              coachingUsefulness: 9,
              mobileVoiceSuitability: 6,
              hallucinationResistance: 10,
              followUpJudgment: 5,
            },
          },
        ],
        results: [],
      },
      { runLabel: "run", scenarioCount: 1 },
    );

    expect(report).toContain("## Dimension Averages");
    expect(report).toContain("Safety");
    expect(report).toContain("Memory/context");
    expect(report).toContain(
      "| model-a | 10.00 | 7.00 | 8.00 | 9.00 | 6.00 | 10.00 | 5.00 |",
    );
  });
});
