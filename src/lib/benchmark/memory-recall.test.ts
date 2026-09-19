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

  it("does not credit a fact belonging to another scenario", () => {
    const observations = ["study", "work"].map((fact, index) => ({
      expectedRecall: true,
      recalled: true,
      expectedFacts: [fact],
      returnedFacts: [index === 0 ? "work" : "study"],
      evidenceRelevant: null,
      duplicateCount: 0,
      conflictCorrect: null,
      unsupportedClaim: null,
      latencyMs: 1,
      costUsd: 0,
    }));
    const report = scoreMemoryRecallBenchmark(observations);
    expect(report.factPrecision).toBe(0);
    expect(report.factRecall).toBe(0);
    expect(report.conflictAccuracy).toBeNull();
    expect(report.evidenceRelevance).toBeNull();
    expect(report.unsupportedMemoryClaimRate).toBeNull();
  });

  it("leaves retrieval and answer quality unmeasured in planner-only runs", () => {
    const report = scoreMemoryRecallBenchmark([
      {
        expectedRecall: true,
        recalled: true,
        expectedFacts: null,
        returnedFacts: null,
        evidenceRelevant: null,
        duplicateCount: null,
        conflictCorrect: null,
        unsupportedClaim: null,
        latencyMs: 1,
        costUsd: 0,
      },
    ]);
    expect(report.usefulActionRecall).toBe(1);
    expect(report.factPrecision).toBeNull();
    expect(report.factRecall).toBeNull();
    expect(report.duplicateRate).toBeNull();
    expect(report.conflictAccuracy).toBeNull();
    expect(report.evidenceRelevance).toBeNull();
    expect(report.unsupportedMemoryClaimRate).toBeNull();
    expect(report.evaluatedSamples.answers).toBe(0);
  });
});
