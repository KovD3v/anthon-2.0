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

  it("accepts bounded classifier attribution while preserving legacy traces", () => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        classifierModel: "nvidia/nemotron-3.5-lightning",
        classifierProvider: "DeepInfra",
      }),
    ).toMatchObject({
      classifierModel: "nvidia/nemotron-3.5-lightning",
      classifierProvider: "DeepInfra",
    });
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
    ["a cancelled first attempt", "cancelled"],
    ["a failed-during-stream first attempt", "failed_during_stream"],
  ])("rejects an escalation after %s", (_label, outcome) => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        routingMode: "active",
        eligibleProfile: "light",
        plannedProfile: "light",
        executedProfile: "standard",
        taskKind: "rewrite",
        attempts: [
          {
            sequence: 1,
            profile: "light",
            outcome,
            generationTimeMs: 10,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 20,
          },
        ],
        escalation: {
          from: "light",
          to: "standard",
          reason: "provider_error",
        },
      }),
    ).toBeNull();
  });

  it.each(["completed", "cancelled"] as const)(
    "rejects a retry after a terminal %s attempt",
    (outcome) => {
      expect(
        parseExecutionRouteTrace({
          ...completedStandardTrace,
          attempts: [
            {
              sequence: 1,
              profile: "standard",
              outcome,
              generationTimeMs: 10,
            },
            {
              sequence: 2,
              profile: "standard",
              outcome: "completed",
              generationTimeMs: 20,
            },
          ],
        }),
      ).toBeNull();
    },
  );

  it.each(["off", "shadow"] as const)(
    "rejects light execution while routing is %s",
    (routingMode) => {
      expect(
        parseExecutionRouteTrace({
          ...completedStandardTrace,
          routingMode,
          eligibleProfile: "light",
          plannedProfile: "standard",
          executedProfile: "light",
          taskKind: "rewrite",
          attempts: [
            {
              sequence: 1,
              profile: "light",
              outcome: "completed",
              generationTimeMs: 20,
            },
          ],
        }),
      ).toBeNull();
    },
  );

  it("rejects a second standard attempt without a planned-light escalation", () => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        routingMode: "active",
        attempts: [
          {
            sequence: 1,
            profile: "standard",
            outcome: "failed_before_stream",
            generationTimeMs: 10,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 20,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects standard execution for an active planned-light route without escalation", () => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        routingMode: "active",
        eligibleProfile: "light",
        plannedProfile: "light",
        executedProfile: "standard",
        taskKind: "rewrite",
        attempts: [
          {
            sequence: 1,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 20,
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires escalation when attempts transition from light to standard", () => {
    expect(
      parseExecutionRouteTrace({
        ...completedStandardTrace,
        routingMode: "active",
        eligibleProfile: "light",
        plannedProfile: "light",
        taskKind: "rewrite",
        attempts: [
          {
            sequence: 1,
            profile: "light",
            outcome: "failed_before_stream",
            generationTimeMs: 10,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 20,
          },
        ],
      }),
    ).toBeNull();
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
    ["an invalid policy version", { policyVersion: 2 }],
    ["an invalid classifier version", { classifierVersion: 2 }],
    [
      "an invalid attempt outcome",
      {
        attempts: [
          {
            ...completedStandardTrace.attempts[0],
            outcome: "recovered",
          },
        ],
      },
    ],
    ["a negative routing latency", { routingOverheadMs: -1 }],
    ["a non-finite classification latency", { classificationLatencyMs: NaN }],
    ["an oversized classifier model", { classifierModel: "m".repeat(129) }],
    [
      "an oversized classifier provider",
      { classifierProvider: "p".repeat(129) },
    ],
  ])("rejects %s", (_label, invalidValue) => {
    expect(
      parseExecutionRouteTrace({ ...completedStandardTrace, ...invalidValue }),
    ).toBeNull();
  });
});
