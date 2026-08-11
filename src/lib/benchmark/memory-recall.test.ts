import { describe, expect, it } from "vitest";
import { scoreMemoryRecallBenchmark } from "./memory-recall";

describe("memory recall benchmark", () => {
  it("scores action quality, facts, evidence, safety, latency, and cost", () => {
    const report = scoreMemoryRecallBenchmark([
      {
        expectedRecall: true,
        recalled: true,
        expectedFacts: ["sport"],
        returnedFacts: ["sport"],
        evidenceRelevant: true,
        duplicateCount: 0,
        conflictCorrect: true,
        unsupportedClaim: false,
        latencyMs: 80,
        costUsd: 0.001,
      },
      {
        expectedRecall: false,
        recalled: true,
        expectedFacts: [],
        returnedFacts: [],
        evidenceRelevant: null,
        duplicateCount: 0,
        conflictCorrect: true,
        unsupportedClaim: false,
        latencyMs: 120,
        costUsd: 0,
      },
    ]);
    expect(report.usefulActionRecall).toBe(1);
    expect(report.unnecessaryActionRate).toBe(1);
    expect(report.factPrecision).toBe(1);
    expect(report.unsupportedMemoryClaimRate).toBe(0);
    expect(report.latencyP95Ms).toBe(120);
    expect(report.totalCostUsd).toBe(0.001);
  });
});
