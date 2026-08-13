import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTechnicalUsage,
  resolveTechnicalDiagnosticsVisibility,
  resolveTechnicalMetricsVisibility,
} from "./technical-metrics";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveTechnicalMetricsVisibility", () => {
  it.each([
    {
      role: "USER",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "ADMIN",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "SUPER_ADMIN",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "ADMIN",
      preference: false,
      isGuest: false,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "USER",
      preference: true,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: true,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: false,
      isPrivateOwner: false,
      expected: false,
    },
  ] as const)("returns $expected for %o", ({ expected, ...input }) => {
    expect(resolveTechnicalMetricsVisibility(input)).toBe(expected);
  });

  it("enables localhost diagnostics unless an explicit override disables them", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      resolveTechnicalMetricsVisibility({
        role: "USER",
        preference: null,
        isGuest: false,
        isPrivateOwner: true,
      }),
    ).toBe(true);
    expect(
      resolveTechnicalMetricsVisibility({
        role: "SUPER_ADMIN",
        preference: false,
        isGuest: false,
        isPrivateOwner: true,
      }),
    ).toBe(false);
    expect(
      resolveTechnicalMetricsVisibility({
        role: "SUPER_ADMIN",
        preference: true,
        isGuest: true,
        isPrivateOwner: true,
      }),
    ).toBe(false);
    expect(
      resolveTechnicalMetricsVisibility({
        role: "SUPER_ADMIN",
        preference: true,
        isGuest: false,
        isPrivateOwner: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["SUPER_ADMIN", true, true],
    ["SUPER_ADMIN", false, false],
    ["ADMIN", true, false],
    ["USER", true, false],
  ] as const)(
    "allows production profiler diagnostics only for an enabled SUPER_ADMIN: %s/%s",
    (role, preference, expected) => {
      vi.stubEnv("NODE_ENV", "production");

      expect(
        resolveTechnicalDiagnosticsVisibility({
          role,
          preference,
          isGuest: false,
          isPrivateOwner: true,
        }),
      ).toBe(expected);
    },
  );
});

describe("buildTechnicalUsage", () => {
  it("allowlists persisted response diagnostics for localhost rendering", () => {
    expect(
      buildTechnicalUsage({
        model: "message-model",
        inputTokens: 120,
        outputTokens: 30,
        reasoningTokens: 8,
        costUsd: 0.001,
        generationTimeMs: 900,
        reasoningTimeMs: null,
        ragUsed: true,
        ragChunksCount: 2,
        toolCalls: [{ name: "searchRag" }],
        metadata: {
          private: "must-not-leak",
          ai: {
            ragAttempted: true,
            memoryRecall: {
              mode: "active",
              reason: "returning_user",
              factCount: 2,
              evidenceCount: 1,
              factRecallMs: 12,
              conversationRecallMs: 24,
              degraded: false,
              private: "must-not-leak",
            },
          },
        },
        metrics: {
          model: "executed-model",
          provider: "Together",
          reasoningTokens: 9,
          toolCallCount: 1,
          toolResultChars: 420,
          toolTiming: {
            firstModelStepMs: 200,
            toolExecutionMs: 150,
            finalModelStepMs: 300,
            private: "must-not-leak",
          },
          ragUsed: true,
          ragChunksCount: 2,
          executionRoute: {
            schemaVersion: 1,
            routingMode: "active",
            policyVersion: 1,
            classifierVersion: 1,
            eligibleProfile: "light",
            plannedProfile: "light",
            executedProfile: "light",
            taskKind: "social",
            decisionSource: "classifier",
            confidenceBucket: "high",
            reasonCodes: ["classifier_light", "task_allowlisted"],
            classificationLatencyMs: 14,
            routingOverheadMs: 18,
            totalRequestTimeToFirstTokenMs: 220,
            attempts: [
              {
                sequence: 1,
                profile: "light",
                outcome: "completed",
                timeToFirstTokenMs: 160,
                generationTimeMs: 700,
                inputTokens: 120,
                outputTokens: 30,
                reasoningTokens: 9,
                costUsd: 0.001,
              },
            ],
          },
        },
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      cost: 0.001,
      generationTimeMs: 900,
      model: "executed-model",
      provider: "Together",
      executedProfile: "standard",
      reasoningTokens: 9,
      toolCallCount: 1,
      toolResultChars: 420,
      toolTiming: {
        firstModelStepMs: 200,
        toolExecutionMs: 150,
        finalModelStepMs: 300,
      },
      ragAttempted: true,
      ragUsed: true,
      ragChunksCount: 2,
      memoryRecall: {
        mode: "active",
        reason: "returning_user",
        factCount: 2,
        evidenceCount: 1,
        factRecallMs: 12,
        conversationRecallMs: 24,
        degraded: false,
      },
      executionRoute: {
        schemaVersion: 1,
        routingMode: "active",
        policyVersion: 1,
        classifierVersion: 1,
        eligibleProfile: "light",
        plannedProfile: "light",
        executedProfile: "light",
        taskKind: "social",
        decisionSource: "classifier",
        confidenceBucket: "high",
        reasonCodes: ["classifier_light", "task_allowlisted"],
        classificationLatencyMs: 14,
        routingOverheadMs: 18,
        totalRequestTimeToFirstTokenMs: 220,
        attempts: [
          {
            sequence: 1,
            profile: "light",
            outcome: "completed",
            timeToFirstTokenMs: 160,
            generationTimeMs: 700,
            inputTokens: 120,
            outputTokens: 30,
            reasoningTokens: 9,
            costUsd: 0.001,
          },
        ],
      },
    });
  });

  it("keeps the existing compact usage payload when diagnostics are disabled", () => {
    expect(
      buildTechnicalUsage(
        {
          model: "private-model",
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.01,
          generationTimeMs: 120,
          reasoningTimeMs: null,
          ragUsed: true,
          toolCalls: [{ name: "search" }],
        },
        { includeDiagnostics: false },
      ),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.01,
      generationTimeMs: 120,
    });
  });
});
