import { describe, expect, it } from "vitest";
import type { RealityScenario } from "./reality";
import {
  assertRealityBenchmarkDbMutationAllowed,
  DEFAULT_REALITY_BENCHMARK_MODELS,
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
      allowDbMutation: true,
      keepData: true,
    });
  });

  it("parses judge-existing without requiring DB mutation approval", () => {
    const config = parseRealityBenchmarkArgs([
      "--judge-existing",
      "docs/benchmarks/runs/run.json",
    ]);

    expect(config).toMatchObject({
      judge: true,
      judgeExistingPath: "docs/benchmarks/runs/run.json",
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
});
