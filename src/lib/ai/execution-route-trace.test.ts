import { describe, expect, it } from "vitest";
import { parseExecutionRouteTrace } from "./execution-route-trace";

const completedStandardTrace = {
  schemaVersion: 1,
  routingMode: "off",
  policyVersion: 1,
  classifierVersion: 1,
  eligibleProfile: "standard",
  plannedProfile: "standard",
  executedProfile: "standard",
  taskKind: "coaching",
  decisionSource: "rule",
  confidenceBucket: "medium",
  reasonCodes: ["sensitive_content", "rollout_off"],
  classificationLatencyMs: 12,
  routingOverheadMs: 1,
  totalRequestTimeToFirstTokenMs: 210,
  attempts: [
    {
      sequence: 1,
      profile: "standard",
      outcome: "completed",
      timeToFirstTokenMs: 210,
      generationTimeMs: 900,
      inputTokens: 42,
      outputTokens: 17,
      reasoningTokens: 3,
      costUsd: 0.004,
    },
  ],
} as const;

describe("parseExecutionRouteTrace", () => {
  it("accepts a completed standard turn", () => {
    expect(parseExecutionRouteTrace(completedStandardTrace)).toEqual(
      completedStandardTrace,
    );
  });

  it("accepts a shadow light-eligible turn executed on standard", () => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        routingMode: "shadow",
        eligibleProfile: "light",
        plannedProfile: "standard",
        taskKind: "rewrite",
        decisionSource: "classifier",
        confidenceBucket: "high",
        reasonCodes: ["classifier_light", "rollout_shadow"],
      }),
    ).toMatchObject({
      routingMode: "shadow",
      eligibleProfile: "light",
      plannedProfile: "standard",
      executedProfile: "standard",
    });
  });

  it("accepts a bounded light-to-standard escalation", () => {
    const escalatedTrace = {
      ...completedStandardTrace,
      routingMode: "active",
      eligibleProfile: "light",
      plannedProfile: "light",
      taskKind: "rewrite",
      decisionSource: "classifier",
      confidenceBucket: "high",
      reasonCodes: ["classifier_light", "task_allowlisted"],
      attempts: [
        {
          sequence: 1,
          profile: "light",
          outcome: "failed_before_stream",
          generationTimeMs: 50,
          inputTokens: 10,
          costUsd: 0.001,
        },
        {
          sequence: 2,
          profile: "standard",
          outcome: "completed",
          generationTimeMs: 300,
          inputTokens: 30,
          outputTokens: 20,
          reasoningTokens: 4,
          costUsd: 0.006,
        },
      ],
      escalation: {
        from: "light",
        to: "standard",
        reason: "empty_response",
      },
    } as const;

    expect(parseExecutionRouteTrace(escalatedTrace)).toMatchObject({
      eligibleProfile: "light",
      plannedProfile: "light",
      executedProfile: "standard",
      escalation: {
        from: "light",
        to: "standard",
        reason: "empty_response",
      },
      attempts: [
        { sequence: 1, profile: "light", outcome: "failed_before_stream" },
        { sequence: 2, profile: "standard", outcome: "completed" },
      ],
    });
  });

  it.each([
    ["an invalid profile", { executedProfile: "premium" }],
    [
      "more than two attempts",
      {
        attempts: [
          ...completedStandardTrace.attempts,
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 1,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 1,
          },
        ],
      },
    ],
    ["a free-form reason", { reasonCodes: ["user said something secret"] }],
    ["a missing executed profile", { executedProfile: undefined }],
    ["an unrecognized key", { classifierProse: "SECRET_CLASSIFIER_PROSE" }],
  ])("rejects %s", (_label, invalidValue) => {
    expect(
      parseExecutionRouteTrace({ ...completedStandardTrace, ...invalidValue }),
    ).toBeNull();
  });
});
