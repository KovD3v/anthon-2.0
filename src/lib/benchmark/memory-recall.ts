export type MemoryRecallBenchmarkObservation = {
  expectedRecall: boolean;
  recalled: boolean;
  expectedFacts: string[] | null;
  returnedFacts: string[] | null;
  evidenceRelevant: boolean | null;
  duplicateCount: number | null;
  conflictCorrect: boolean | null;
  unsupportedClaim: boolean | null;
  latencyMs: number;
  costUsd: number;
};

const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : null;

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(
        sorted.length - 1,
        Math.ceil(percentileValue * sorted.length) - 1,
      )
    ] ?? 0
  );
}

export function scoreMemoryRecallBenchmark(
  observations: MemoryRecallBenchmarkObservation[],
) {
  const useful = observations.filter((item) => item.expectedRecall);
  const controls = observations.filter((item) => !item.expectedRecall);
  const factObservations = observations.filter(
    (item) => item.expectedFacts !== null && item.returnedFacts !== null,
  );
  const expectedCount = factObservations.reduce(
    (sum, item) => sum + new Set(item.expectedFacts).size,
    0,
  );
  const returnedCount = factObservations.reduce(
    (sum, item) => sum + new Set(item.returnedFacts).size,
    0,
  );
  const correctCount = factObservations.reduce(
    (sum, item) =>
      sum +
      [...new Set(item.returnedFacts)].filter((fact) =>
        item.expectedFacts?.includes(fact),
      ).length,
    0,
  );
  const evidence = observations.filter(
    (item) => item.evidenceRelevant !== null,
  );
  const conflicts = observations.filter(
    (item) => item.conflictCorrect !== null,
  );
  const answers = observations.filter((item) => item.unsupportedClaim !== null);
  const duplicates = factObservations.filter(
    (item) => item.duplicateCount !== null,
  );
  return {
    usefulActionRecall: ratio(
      useful.filter((item) => item.recalled).length,
      useful.length,
    ),
    unnecessaryActionRate: ratio(
      controls.filter((item) => item.recalled).length,
      controls.length,
    ),
    factPrecision: ratio(correctCount, returnedCount),
    factRecall: ratio(correctCount, expectedCount),
    duplicateRate: ratio(
      duplicates.reduce((sum, item) => sum + (item.duplicateCount ?? 0), 0),
      duplicates.reduce(
        (sum, item) => sum + (item.returnedFacts?.length ?? 0),
        0,
      ),
    ),
    conflictAccuracy: ratio(
      conflicts.filter((item) => item.conflictCorrect).length,
      conflicts.length,
    ),
    evidenceRelevance: ratio(
      evidence.filter((item) => item.evidenceRelevant).length,
      evidence.length,
    ),
    unsupportedMemoryClaimRate: ratio(
      answers.filter((item) => item.unsupportedClaim).length,
      answers.length,
    ),
    latencyP50Ms: percentile(
      observations.map((item) => item.latencyMs),
      0.5,
    ),
    latencyP95Ms: percentile(
      observations.map((item) => item.latencyMs),
      0.95,
    ),
    totalCostUsd: observations.reduce((sum, item) => sum + item.costUsd, 0),
    evaluatedSamples: {
      actions: observations.length,
      facts: factObservations.length,
      conflicts: conflicts.length,
      evidence: evidence.length,
      answers: answers.length,
    },
  };
}
