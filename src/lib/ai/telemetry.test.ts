import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getPostHogClient: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/posthog", () => ({
  getPostHogClient: mocks.getPostHogClient,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: mocks.warn }),
}));

import {
  captureAiExecutionRouting,
  captureAiGenerationMetadata,
  captureClientTraceStored,
} from "./telemetry";

describe("captureAiGenerationMetadata", () => {
  beforeEach(() => {
    mocks.capture.mockReset();
    mocks.getPostHogClient.mockReset();
    mocks.warn.mockReset();
    mocks.getPostHogClient.mockReturnValue({ capture: mocks.capture });
  });

  it("captures bounded metrics without prompt, output, reasoning, or tool content", () => {
    captureAiGenerationMetadata({
      context: {
        distinctId: "user-1",
        traceId: "trace-1",
        conversationId: "chat-1",
        planId: "basic",
        effectiveModelTier: "BASIC",
        userRole: "USER",
        promptMode: "full",
      },
      metrics: {
        model: "openai/gpt-5.6-luna",
        provider: "openrouter",
        providerMetadata: {
          openrouter: { requestId: "SECRET_PROVIDER_PAYLOAD" },
        },
        inputTokens: 20,
        outputTokens: 10,
        reasoningTokens: 3,
        reasoningContent: "SECRET_REASONING",
        toolCalls: [
          {
            name: "saveMemory",
            args: { value: "SECRET_TOOL_ARGUMENT" },
            result: "SECRET_TOOL_RESULT",
          },
        ],
        toolCallCount: 1,
        ragAttempted: true,
        ragUsed: true,
        ragChunksCount: 2,
        capabilitiesUsed: ["rag", "memory", "voice"],
        costUsd: 0.004,
        generationTimeMs: 1250,
        reasoningTimeMs: 300,
        tracePayload: {
          userMessage: "SECRET_PROMPT",
          systemPrompt: "SECRET_SYSTEM_PROMPT",
          output: "SECRET_OUTPUT",
        },
        serverTrace: {
          version: 1,
          status: "completed",
          totalMs: 123,
          spans: [
            {
              name: "model_stream",
              provider: "SECRET_TRACE_PROVIDER",
            },
          ],
        },
      } as never,
    });

    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "$ai_generation",
      properties: expect.objectContaining({
        $ai_provider: "openrouter",
        $ai_model: "openai/gpt-5.6-luna",
        $ai_input_tokens: 20,
        $ai_output_tokens: 10,
        $ai_reasoning_tokens: 3,
        $ai_latency: 1.25,
        $ai_trace_id: "trace-1",
        $ai_total_cost_usd: 0.004,
        toolCallCount: 1,
        ragAttempted: true,
        capabilitiesUsed: ["rag", "memory"],
      }),
    });

    const captured = JSON.stringify(mocks.capture.mock.calls[0]);
    for (const secret of [
      "SECRET_REASONING",
      "SECRET_TOOL_ARGUMENT",
      "SECRET_TOOL_RESULT",
      "SECRET_PROMPT",
      "SECRET_SYSTEM_PROMPT",
      "SECRET_OUTPUT",
      "SECRET_PROVIDER_PAYLOAD",
      "SECRET_TRACE_PROVIDER",
    ]) {
      expect(captured).not.toContain(secret);
    }
    const properties = mocks.capture.mock.calls[0]?.[0].properties;
    expect(properties).not.toHaveProperty("$ai_input");
    expect(properties).not.toHaveProperty("$ai_output_choices");
    expect(properties).not.toHaveProperty("$ai_tools");
  });

  it("never throws when PostHog is unavailable", () => {
    mocks.getPostHogClient.mockImplementation(() => {
      throw new Error("missing key");
    });

    expect(() =>
      captureAiGenerationMetadata({
        context: { distinctId: "user-1", traceId: "trace-1" },
        metrics: {
          model: "model",
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: null,
          toolCalls: null,
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0,
          generationTimeMs: 1,
          reasoningTimeMs: null,
        },
      }),
    ).not.toThrow();
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it("bounds identifier and label fields", () => {
    captureAiGenerationMetadata({
      context: {
        distinctId: "u".repeat(200),
        traceId: "t".repeat(200),
        conversationId: "c".repeat(200),
      },
      metrics: {
        model: "m".repeat(200),
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        toolCalls: null,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: null,
      },
    });

    const captured = mocks.capture.mock.calls[0]?.[0];
    expect(captured.distinctId).toHaveLength(128);
    expect(captured.properties.$ai_trace_id).toHaveLength(128);
    expect(captured.properties.$ai_model).toHaveLength(128);
    expect(captured.properties.conversationId).toHaveLength(128);
  });

  it("flattens only safe execution-route scalars into generation telemetry", () => {
    captureAiGenerationMetadata({
      context: { distinctId: "user-1", traceId: "trace-1" },
      metrics: {
        model: "standard-model",
        inputTokens: 60,
        outputTokens: 20,
        reasoningTokens: 4,
        toolCalls: null,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.007,
        generationTimeMs: 800,
        reasoningTimeMs: null,
        executionRoute: {
          schemaVersion: 1,
          routingMode: "active",
          policyVersion: 1,
          classifierVersion: 1,
          eligibleProfile: "light",
          plannedProfile: "light",
          executedProfile: "standard",
          taskKind: "rewrite",
          decisionSource: "classifier",
          confidenceBucket: "high",
          reasonCodes: ["classifier_light"],
          classificationLatencyMs: 25,
          routingOverheadMs: 2,
          totalRequestTimeToFirstTokenMs: 310,
          attempts: [
            {
              sequence: 1,
              profile: "light",
              outcome: "failed_before_stream",
              generationTimeMs: 50,
            },
            {
              sequence: 2,
              profile: "standard",
              outcome: "completed",
              generationTimeMs: 800,
            },
          ],
          escalation: {
            from: "light",
            to: "standard",
            reason: "empty_response",
          },
        },
        userText: "SECRET_USER_TEXT",
        prompt: "SECRET_PROMPT",
        classifierProse: "SECRET_CLASSIFIER_PROSE",
        reasoning: "SECRET_REASONING",
        url: "https://secret.example/SECRET_URL",
        memory: "SECRET_MEMORY",
        toolPayload: { secret: "SECRET_TOOL_PAYLOAD" },
      } as never,
    });

    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "$ai_generation",
      properties: expect.objectContaining({
        routing_mode: "active",
        eligible_profile: "light",
        planned_profile: "light",
        executed_profile: "standard",
        task_kind: "rewrite",
        decision_source: "classifier",
        confidence_bucket: "high",
        policy_version: 1,
        classifier_version: 1,
        attempt_count: 2,
        escalated: true,
        escalation_reason: "empty_response",
        classification_latency_ms: 25,
        routing_overhead_ms: 2,
        total_request_ttft_ms: 310,
      }),
    });

    const captured = JSON.stringify(mocks.capture.mock.calls[0]);
    for (const secret of [
      "SECRET_USER_TEXT",
      "SECRET_PROMPT",
      "SECRET_CLASSIFIER_PROSE",
      "SECRET_REASONING",
      "SECRET_URL",
      "SECRET_MEMORY",
      "SECRET_TOOL_PAYLOAD",
    ]) {
      expect(captured).not.toContain(secret);
    }
  });

  it("omits malformed execution-route scalars from generation telemetry", () => {
    captureAiGenerationMetadata({
      context: { distinctId: "user-1", traceId: "trace-1" },
      metrics: {
        model: "standard-model",
        inputTokens: 60,
        outputTokens: 20,
        reasoningTokens: null,
        toolCalls: null,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.007,
        generationTimeMs: 800,
        reasoningTimeMs: null,
        executionRoute: {
          schemaVersion: 1,
          routingMode: "UNSAFE_ROUTE_MODE",
          policyVersion: 1,
          classifierVersion: 1,
          eligibleProfile: "light",
          plannedProfile: "light",
          executedProfile: "standard",
          taskKind: "UNSAFE_TASK_KIND",
          decisionSource: "classifier",
          confidenceBucket: "high",
          reasonCodes: ["classifier_light"],
          classificationLatencyMs: 25,
          routingOverheadMs: 2,
          attempts: [
            {
              sequence: 1,
              profile: "standard",
              outcome: "completed",
              generationTimeMs: 800,
            },
          ],
        },
      } as never,
    });

    const properties = mocks.capture.mock.calls[0]?.[0].properties;
    expect(properties).not.toHaveProperty("routing_mode");
    expect(properties).not.toHaveProperty("task_kind");
    expect(JSON.stringify(properties)).not.toContain("UNSAFE_ROUTE_MODE");
    expect(JSON.stringify(properties)).not.toContain("UNSAFE_TASK_KIND");
  });

  it("captures a terminal route failure without assistant metrics", () => {
    captureAiExecutionRouting({
      context: { distinctId: "user-1", traceId: "trace-1" },
      executionRoute: {
        schemaVersion: 1,
        routingMode: "active",
        policyVersion: 1,
        classifierVersion: 1,
        eligibleProfile: "light",
        plannedProfile: "light",
        executedProfile: "standard",
        taskKind: "rewrite",
        decisionSource: "classifier",
        confidenceBucket: "high",
        reasonCodes: ["classifier_light"],
        classificationLatencyMs: 25,
        routingOverheadMs: 2,
        totalRequestTimeToFirstTokenMs: 310,
        attempts: [
          {
            sequence: 1,
            profile: "light",
            outcome: "failed_before_stream",
            generationTimeMs: 50,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "failed_before_stream",
            generationTimeMs: 100,
          },
        ],
        escalation: {
          from: "light",
          to: "standard",
          reason: "provider_error",
        },
      },
      costUsd: 0.007,
    });

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "ai_execution_routing",
      properties: expect.objectContaining({
        routing_mode: "active",
        eligible_profile: "light",
        planned_profile: "light",
        executed_profile: "standard",
        attempt_count: 2,
        escalated: true,
        escalation_reason: "provider_error",
        terminal_outcome: "failed_before_stream",
        total_cost_usd: 0.007,
      }),
    });
  });
});

describe("captureClientTraceStored", () => {
  beforeEach(() => {
    mocks.capture.mockReset();
    mocks.getPostHogClient.mockReset();
    mocks.warn.mockReset();
    mocks.getPostHogClient.mockReturnValue({ capture: mocks.capture });
  });

  it("captures only owned-row labels and scalar browser milestones", () => {
    captureClientTraceStored({
      distinctId: "user-1",
      model: "standard-model",
      provider: "Nebius",
      trace: {
        version: 1,
        status: "completed",
        milestones: {
          requestStartedMs: 0,
          streamOpenedMs: 10,
          firstChunkReceivedMs: 20,
          firstTextDeltaReceivedMs: 30,
          firstDomTextMs: 40,
          firstVisibleFrameMs: 50,
          streamCompletedMs: 60,
          persistedMessageResolvedMs: 70,
        },
      },
      executionRoute: {
        schemaVersion: 1,
        routingMode: "active",
        policyVersion: 1,
        classifierVersion: 1,
        eligibleProfile: "light",
        plannedProfile: "light",
        executedProfile: "standard",
        taskKind: "rewrite",
        decisionSource: "classifier",
        confidenceBucket: "high",
        reasonCodes: [],
        classificationLatencyMs: 10,
        routingOverheadMs: 2,
        attempts: [
          {
            sequence: 1,
            profile: "light",
            outcome: "failed_before_stream",
            generationTimeMs: 30,
          },
          {
            sequence: 2,
            profile: "standard",
            outcome: "completed",
            generationTimeMs: 100,
          },
        ],
        escalation: {
          from: "light",
          to: "standard",
          reason: "provider_error",
        },
      },
    });

    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "ai_client_response_trace",
      properties: {
        client_trace_status: "completed",
        first_delta_ms: 30,
        first_visible_ms: 50,
        perceived_completion_ms: 60,
        model: "standard-model",
        provider: "Nebius",
        executed_profile: "standard",
      },
    });
    const captured = JSON.stringify(mocks.capture.mock.calls[0]);
    expect(captured).not.toContain("milestones");
    expect(captured).not.toContain("clientMessageId");
    expect(captured).not.toContain("executionRoute");
  });
});
