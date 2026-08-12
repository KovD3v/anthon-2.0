import type { VoiceSuitability } from "@/lib/voice/decision";
import type { VoiceSuitabilityCategory } from "@/lib/voice/suitability-prompt";

export interface VoiceClassifierBenchmarkResult {
  expected: VoiceSuitabilityCategory;
  rawCategory?: VoiceSuitabilityCategory;
  effectiveCategory: VoiceSuitability;
  protectedText: boolean;
  durationMs: number;
}

export interface VoiceClassifierScore {
  total: number;
  validOutputs: number;
  rawCategoryCorrect: number;
  effectiveCorrect: number;
  protectedFalseVoice: number;
  latencyMs: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  passed: boolean;
}

function isVoiceCategory(category: VoiceSuitability): boolean {
  return (
    category === "VOICE_REQUIRED" ||
    category === "VOICE_STRONG" ||
    category === "VOICE_NATURAL"
  );
}

function nearestRankPercentile(
  values: number[],
  quantile: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(quantile * sorted.length) - 1,
  );
  return Math.round(sorted[index] * 10) / 10;
}

export function scoreVoiceClassifier(
  results: VoiceClassifierBenchmarkResult[],
): VoiceClassifierScore {
  const total = results.length;
  const validResults = results.filter(
    (result) => result.rawCategory !== undefined,
  );
  const validOutputs = validResults.length;
  const rawCategoryCorrect = validResults.filter(
    (result) => result.rawCategory === result.expected,
  ).length;
  const effectiveCorrect = results.filter(
    (result) =>
      isVoiceCategory(result.effectiveCategory) ===
      isVoiceCategory(result.expected),
  ).length;
  const protectedFalseVoice = results.filter(
    (result) =>
      result.protectedText && isVoiceCategory(result.effectiveCategory),
  ).length;
  const validLatencies = validResults.map((result) => result.durationMs);
  const latencyMs = {
    p50: nearestRankPercentile(validLatencies, 0.5),
    p95: nearestRankPercentile(validLatencies, 0.95),
    p99: nearestRankPercentile(validLatencies, 0.99),
  };
  const passed =
    validOutputs >= Math.ceil(total * 0.995) &&
    effectiveCorrect === total &&
    protectedFalseVoice === 0 &&
    latencyMs.p95 !== null &&
    latencyMs.p95 <= 600;

  return {
    total,
    validOutputs,
    rawCategoryCorrect,
    effectiveCorrect,
    protectedFalseVoice,
    latencyMs,
    passed,
  };
}
