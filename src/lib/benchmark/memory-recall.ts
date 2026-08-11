export type MemoryRecallBenchmarkObservation = {
  expectedRecall: boolean;
  recalled: boolean;
  expectedFacts: string[];
  returnedFacts: string[];
  evidenceRelevant: boolean | null;
  duplicateCount: number;
  conflictCorrect: boolean;
  unsupportedClaim: boolean;
  latencyMs: number;
  costUsd: number;
};

const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : 0;

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
  const expectedFacts = observations.flatMap((item) => item.expectedFacts);
  const returnedFacts = observations.flatMap((item) => item.returnedFacts);
  const expectedSet = new Set(expectedFacts);
  const trueFacts = returnedFacts.filter((fact) => expectedSet.has(fact));
  const evidence = observations.filter(
    (item) => item.evidenceRelevant !== null,
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
    factPrecision: ratio(trueFacts.length, returnedFacts.length),
    factRecall: ratio(new Set(trueFacts).size, new Set(expectedFacts).size),
    duplicateRate: ratio(
      observations.reduce((sum, item) => sum + item.duplicateCount, 0),
      returnedFacts.length,
    ),
    conflictAccuracy: ratio(
      observations.filter((item) => item.conflictCorrect).length,
      observations.length,
    ),
    evidenceRelevance: ratio(
      evidence.filter((item) => item.evidenceRelevant).length,
      evidence.length,
    ),
    unsupportedMemoryClaimRate: ratio(
      observations.filter((item) => item.unsupportedClaim).length,
      observations.length,
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
  };
}
