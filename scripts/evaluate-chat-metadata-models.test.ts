import { describe, expect, it } from "vitest";
import {
  EVAL_MODELS,
  type EvalAttempt,
  percentile,
  scoreIcon,
  selectConsolidationDecision,
  summarizeCandidate,
} from "./evaluate-chat-metadata-models";

function attempt(
  overrides: Partial<EvalAttempt> & Pick<EvalAttempt, "model" | "scenarioId">,
): EvalAttempt {
  return {
    anonymousId: "attempt-1",
    pass: 1,
    durationMs: 100,
    success: true,
    titleScore: 1,
    iconScore: 1,
    costUsd: 0.001,
    inputTokens: 20,
    outputTokens: 8,
    output: { title: "Pressione prima della finale", icon: "TROPHY" },
    ...overrides,
  };
}

describe("chat metadata model evaluation", () => {
  it("pins the exact requested candidates", () => {
    expect(EVAL_MODELS).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "nvidia/nemotron-3.5-lightning",
    ]);
  });

  it("calculates nearest-rank percentiles from positive durations", () => {
    expect(percentile([500, 100, 400, 200, 300], 0.5)).toBe(300);
    expect(percentile([500, 100, 400, 200, 300], 0.95)).toBe(500);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("uses scenario-specific accepted icons", () => {
    expect(scoreIcon("pre_competition_pressure", "TROPHY")).toBe(1);
    expect(scoreIcon("pre_competition_pressure", "MESSAGE_SQUARE")).toBe(0);
    expect(scoreIcon("vague_opening", "MESSAGE_SQUARE")).toBe(1);
  });

  it("rejects a candidate with no successful positive-duration output", () => {
    const summary = summarizeCandidate("qwen/qwen3.7-flash", [
      attempt({
        model: "qwen/qwen3.7-flash",
        scenarioId: "pre_competition_pressure",
        success: false,
        durationMs: 120,
        output: undefined,
        titleScore: 0,
        iconScore: 0,
        errorName: "AI_NoObjectGeneratedError",
      }),
    ]);

    expect(summary.eligible).toBe(false);
    expect(summary.successRate).toBe(0);
    expect(summary.latencyMs).toEqual({ p50: null, p95: null });
  });

  it("summarizes only successful attempts for quality and latency", () => {
    const model = "deepseek/deepseek-v4-flash";
    const summary = summarizeCandidate(model, [
      attempt({
        model,
        scenarioId: "pre_competition_pressure",
        durationMs: 90,
      }),
      attempt({
        model,
        scenarioId: "vague_opening",
        anonymousId: "attempt-2",
        durationMs: 210,
        titleScore: 0.5,
        iconScore: 1,
        costUsd: 0.002,
      }),
      attempt({
        model,
        scenarioId: "running_goal",
        anonymousId: "attempt-3",
        success: false,
        durationMs: 1_000,
        output: undefined,
        titleScore: 0,
        iconScore: 0,
        errorName: "TimeoutError",
      }),
    ]);

    expect(summary.eligible).toBe(true);
    expect(summary.successRate).toBeCloseTo(2 / 3);
    expect(summary.titleScore).toBe(0.75);
    expect(summary.iconScore).toBe(1);
    expect(summary.totalCostUsd).toBeCloseTo(0.003);
    expect(summary.latencyMs).toEqual({ p50: 90, p95: 210 });
    expect(summary.errors).toEqual({ TimeoutError: 1 });
  });

  it("retains the incumbent when every challenger fails structured output", () => {
    const attempts = [
      attempt({
        model: "deepseek/deepseek-v4-flash",
        scenarioId: "pre_competition_pressure",
      }),
      attempt({
        model: "deepseek/deepseek-v4-flash-0731",
        scenarioId: "pre_competition_pressure",
      }),
      attempt({
        model: "deepseek/deepseek-v4-flash-0731",
        scenarioId: "running_goal",
        success: false,
        output: undefined,
        titleScore: 0,
        iconScore: 0,
      }),
      attempt({
        model: "nvidia/nemotron-3.5-lightning",
        scenarioId: "pre_competition_pressure",
        success: false,
        output: undefined,
        titleScore: 0,
        iconScore: 0,
      }),
    ];
    const summaries = EVAL_MODELS.map((model) =>
      summarizeCandidate(model, attempts),
    );

    expect(selectConsolidationDecision(summaries)).toEqual(
      expect.objectContaining({
        selectedModel: "deepseek/deepseek-v4-flash",
        promoted: false,
      }),
    );
  });
});
