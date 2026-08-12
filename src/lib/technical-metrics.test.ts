import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTechnicalUsage,
  resolveTechnicalMetricsVisibility,
} from "./technical-metrics";

const validServerTrace = {
  version: 1 as const,
  status: "completed" as const,
  totalMs: 120,
  timeToFirstTokenMs: 40,
  spans: [
    {
      id: 1,
      name: "provider_wait" as const,
      startOffsetMs: 20,
      durationMs: 20,
      status: "completed" as const,
    },
  ],
};

const validClientTrace = {
  version: 1 as const,
  status: "completed" as const,
  milestones: {
    requestStartedMs: 0 as const,
    streamOpenedMs: 10,
    firstChunkReceivedMs: 20,
    firstTextDeltaReceivedMs: 30,
    firstDomTextMs: 40,
    firstVisibleFrameMs: 50,
    streamCompletedMs: 100,
    persistedMessageResolvedMs: 110,
  },
};

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

  it("enables localhost diagnostics for an authenticated private owner", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      resolveTechnicalMetricsVisibility({
        role: "USER",
        preference: false,
        isGuest: false,
        isPrivateOwner: true,
      }),
    ).toBe(true);
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
});

describe("buildTechnicalUsage", () => {
  it("returns rich diagnostics only in development", () => {
    const message = {
      model: "model",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.01,
      generationTimeMs: 120,
      reasoningTimeMs: null,
      ragUsed: true,
      toolCalls: null,
      metrics: {
        developerDiagnostics: {
          version: 1,
          tools: [],
          truncated: false,
        },
      },
    };

    vi.stubEnv("NODE_ENV", "development");
    expect(buildTechnicalUsage(message)).toHaveProperty(
      "developerDiagnostics.version",
      1,
    );

    vi.stubEnv("NODE_ENV", "production");
    expect(buildTechnicalUsage(message)).not.toHaveProperty(
      "developerDiagnostics",
    );
  });

  it("projects only valid response traces when diagnostics are authorized", () => {
    const baseMessage = {
      model: "model",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.01,
      generationTimeMs: 120,
      reasoningTimeMs: null,
      ragUsed: false,
      toolCalls: null,
    };

    expect(
      buildTechnicalUsage({
        ...baseMessage,
        metrics: {
          serverTrace: validServerTrace,
          clientTrace: validClientTrace,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        serverTrace: validServerTrace,
        clientTrace: validClientTrace,
      }),
    );
    const malformedUsage = buildTechnicalUsage({
      ...baseMessage,
      metrics: {
        serverTrace: { ...validServerTrace, totalMs: -1 },
        clientTrace: {
          ...validClientTrace,
          milestones: { requestStartedMs: 0, firstVisibleFrameMs: 5 },
        },
      },
    });
    expect(malformedUsage).not.toHaveProperty("serverTrace");
    expect(malformedUsage).not.toHaveProperty("clientTrace");

    const compactUsage = buildTechnicalUsage(
      {
        ...baseMessage,
        metrics: {
          serverTrace: validServerTrace,
          clientTrace: validClientTrace,
        },
      },
      { includeDiagnostics: false },
    );
    expect(compactUsage).not.toHaveProperty("serverTrace");
    expect(compactUsage).not.toHaveProperty("clientTrace");
  });

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
