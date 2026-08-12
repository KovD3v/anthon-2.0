import { describe, expect, it } from "vitest";
import {
  scoreVoiceClassifier,
  type VoiceClassifierBenchmarkResult,
} from "./voice-classifier";

function passingResults(): VoiceClassifierBenchmarkResult[] {
  return Array.from({ length: 200 }, (_, index) => {
    const voiceExpected = index % 2 === 0;
    return {
      expected: voiceExpected ? "VOICE_NATURAL" : "TEXT_PREFERRED",
      rawCategory: voiceExpected ? "VOICE_NATURAL" : "TEXT_PREFERRED",
      effectiveCategory: voiceExpected ? "VOICE_NATURAL" : "TEXT_PREFERRED",
      protectedText: !voiceExpected,
      durationMs: 600,
    };
  });
}

describe("benchmark/voice-classifier", () => {
  it("passes only a fully correct, reliable, and fast 200-request run", () => {
    expect(scoreVoiceClassifier(passingResults())).toMatchObject({
      total: 200,
      validOutputs: 200,
      rawCategoryCorrect: 200,
      effectiveCorrect: 200,
      protectedFalseVoice: 0,
      latencyMs: { p95: 600 },
      passed: true,
    });
  });

  it("fails with fewer than 199 valid outputs", () => {
    const results = passingResults();
    results[0] = { ...results[0], rawCategory: undefined };
    results[1] = { ...results[1], rawCategory: undefined };

    expect(scoreVoiceClassifier(results)).toMatchObject({
      validOutputs: 198,
      passed: false,
    });
  });

  it("fails when one effective voice-versus-text decision is wrong", () => {
    const results = passingResults();
    results[0] = { ...results[0], effectiveCategory: "TEXT_PREFERRED" };

    expect(scoreVoiceClassifier(results)).toMatchObject({
      effectiveCorrect: 199,
      passed: false,
    });
  });

  it("fails on any protected false-voice decision", () => {
    const results = passingResults();
    results[1] = { ...results[1], effectiveCategory: "VOICE_NATURAL" };

    expect(scoreVoiceClassifier(results)).toMatchObject({
      protectedFalseVoice: 1,
      passed: false,
    });
  });

  it("fails when nearest-rank p95 exceeds 600 ms", () => {
    const results = passingResults();
    for (let index = 0; index < 11; index += 1) {
      results[index] = { ...results[index], durationMs: 601 };
    }

    expect(scoreVoiceClassifier(results)).toMatchObject({
      latencyMs: { p95: 601 },
      passed: false,
    });
  });
});
