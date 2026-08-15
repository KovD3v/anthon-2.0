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
      },
    });
    const captured = JSON.stringify(mocks.capture.mock.calls[0]);
    expect(captured).not.toContain("milestones");
    expect(captured).not.toContain("clientMessageId");
    expect(captured).not.toContain("executionRoute");
  });
});
