import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTracing: vi.fn(),
  stepCountIs: vi.fn(),
  streamText: vi.fn(),
  extractAIMetrics: vi.fn(),
  getModelForUser: vi.fn(),
  getModelIdForPlan: vi.fn(),
  getRagContext: vi.fn(),
  shouldUseRag: vi.fn(),
  buildConversationContext: vi.fn(),
  createMemoryTools: vi.fn(),
  formatMemoriesForPrompt: vi.fn(),
  createTavilyTools: vi.fn(),
  createUserContextTools: vi.fn(),
  formatUserContextForPrompt: vi.fn(),
  measure: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  getPostHogClient: vi.fn(),
  getVoicePlanConfig: vi.fn(),
}));

vi.mock("@posthog/ai", () => ({
  withTracing: mocks.withTracing,
}));

vi.mock("ai", () => ({
  stepCountIs: mocks.stepCountIs,
  streamText: mocks.streamText,
}));

vi.mock("@/lib/ai/cost-calculator", () => ({
  extractAIMetrics: mocks.extractAIMetrics,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  getModelForUser: mocks.getModelForUser,
  getModelIdForPlan: mocks.getModelIdForPlan,
}));

vi.mock("@/lib/ai/rag", () => ({
  getRagContext: mocks.getRagContext,
  shouldUseRag: mocks.shouldUseRag,
}));

vi.mock("@/lib/ai/session-manager", () => ({
  buildConversationContext: mocks.buildConversationContext,
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  createMemoryTools: mocks.createMemoryTools,
  formatMemoriesForPrompt: mocks.formatMemoriesForPrompt,
}));

vi.mock("@/lib/ai/tools/tavily", () => ({
  createTavilyTools: mocks.createTavilyTools,
}));

vi.mock("@/lib/ai/tools/user-context", () => ({
  createUserContextTools: mocks.createUserContextTools,
  formatUserContextForPrompt: mocks.formatUserContextForPrompt,
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

vi.mock("@/lib/posthog", () => ({
  getPostHogClient: mocks.getPostHogClient,
}));

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

import { streamChat } from "./orchestrator";

const baseEntitlements = {
  limits: {
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 10000,
    maxOutputTokensPerDay: 8000,
    maxCostPerDay: 10,
    maxContextMessages: 20,
  },
  modelTier: "BASIC",
  sources: [],
};

describe("ai/orchestrator", () => {
  beforeEach(() => {
    mocks.withTracing.mockReset();
    mocks.stepCountIs.mockReset();
    mocks.streamText.mockReset();
    mocks.extractAIMetrics.mockReset();
    mocks.getModelForUser.mockReset();
    mocks.getModelIdForPlan.mockReset();
    mocks.getRagContext.mockReset();
    mocks.shouldUseRag.mockReset();
    mocks.buildConversationContext.mockReset();
    mocks.createMemoryTools.mockReset();
    mocks.formatMemoriesForPrompt.mockReset();
    mocks.createTavilyTools.mockReset();
    mocks.createUserContextTools.mockReset();
    mocks.formatUserContextForPrompt.mockReset();
    mocks.measure.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.getPostHogClient.mockReset();
    mocks.getVoicePlanConfig.mockReset();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T16:00:00.000Z"));

    vi.stubGlobal("atob", (value: string) =>
      Buffer.from(value, "base64").toString("binary"),
    );

    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );
    mocks.stepCountIs.mockReturnValue("stop-5");
    mocks.getModelForUser.mockReturnValue("base-model");
    mocks.getModelIdForPlan.mockReturnValue("google/gemini-test");
    mocks.getPostHogClient.mockReturnValue("posthog-client");
    mocks.withTracing.mockReturnValue("traced-model");
    mocks.shouldUseRag.mockResolvedValue(false);
    mocks.getRagContext.mockResolvedValue("unused rag");
    mocks.buildConversationContext.mockResolvedValue([
      { role: "user", content: "same message" },
    ]);
    mocks.formatUserContextForPrompt.mockResolvedValue("user-context-data");
    mocks.formatMemoriesForPrompt.mockResolvedValue("user-memories-data");
    mocks.createMemoryTools.mockReturnValue({ saveMemory: "memory-tool" });
    mocks.createUserContextTools.mockReturnValue({
      updateProfile: "profile-tool",
    });
    mocks.createTavilyTools.mockReturnValue({ tavilySearch: "tavily-tool" });
    mocks.resolveEffectiveEntitlements.mockResolvedValue(baseEntitlements);
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
    mocks.extractAIMetrics.mockReturnValue({
      model: "google/gemini-test",
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: true,
      ragChunksCount: 2,
      costUsd: 0.1,
      generationTimeMs: 123,
      reasoningTimeMs: null,
    });
    mocks.streamText.mockReturnValue({ marker: "stream-result" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds stream payload for text messages and skips entitlement lookup when prefetched", async () => {
    const prefetchedEntitlements = {
      ...baseEntitlements,
      modelTier: "PRO" as const,
      limits: {
        ...baseEntitlements.limits,
        maxContextMessages: 12,
      },
    };

    const result = await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "same message",
      effectiveEntitlements: prefetchedEntitlements,
    });

    expect(result).toEqual({ marker: "stream-result" });
    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
    expect(mocks.buildConversationContext).toHaveBeenCalledWith(
      "user-1",
      12,
      "chat-1",
    );
    expect(mocks.getModelForUser).toHaveBeenCalledWith(
      undefined,
      undefined,
      "orchestrator",
      "PRO",
      undefined,
    );
    expect(mocks.withTracing).toHaveBeenCalledWith(
      "base-model",
      "posthog-client",
      expect.objectContaining({
        posthogDistinctId: "user-1",
        posthogTraceId: "chat-1",
      }),
    );
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "traced-model",
        stopWhen: "stop-5",
        messages: [{ role: "user", content: "same message" }],
        tools: {
          saveMemory: "memory-tool",
          updateProfile: "profile-tool",
          tavilySearch: "tavily-tool",
        },
      }),
    );

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      system: string;
    };
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("user-memories-data");
    expect(streamInput.system).toContain(
      "No RAG documents available at this time.",
    );
  });

  it("builds audio/file content parts, strips codec suffixes, and applies voice-disabled prompt variant", async () => {
    mocks.buildConversationContext.mockResolvedValue([]);
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue("**Doc A**\ncontext");

    await streamChat({
      userId: "user-1",
      chatId: "chat-2",
      userMessage: "voice message",
      hasAudio: true,
      voiceEnabled: false,
      messageParts: [
        {
          type: "file",
          data: Buffer.from("abc").toString("base64"),
          mimeType: "audio/webm;codecs=opus",
        },
      ],
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      system: string;
    };
    const content = streamInput.messages[0].content as Array<{
      type: string;
      text?: string;
      mediaType?: string;
      data?: Uint8Array;
    }>;

    expect(content[0]).toEqual({
      type: "text",
      text: "Ascolta questo messaggio vocale e rispondi.",
    });
    expect(content[1]).toMatchObject({
      type: "file",
      mediaType: "audio/webm",
    });
    expect(content[1]?.data).toBeInstanceOf(Uint8Array);
    expect(streamInput.system).toContain("**Doc A**");
    expect(streamInput.system).toContain("Voice generation is disabled");
  });

  it("collects step tool calls and forwards computed metrics through onFinish", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue("**Doc A**\n...\n**Doc B**\n...");

    const userOnFinish = vi.fn();
    const userOnStepFinish = vi.fn();

    await streamChat({
      userId: "user-1",
      chatId: "chat-3",
      userMessage: "hello",
      onFinish: userOnFinish,
      onStepFinish: userOnStepFinish,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      onStepFinish: (step: {
        text?: string;
        toolCalls?: Array<{ toolName: string; args?: unknown }>;
        toolResults?: Array<{ result?: unknown }>;
      }) => void;
      onFinish: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };

    streamInput.onStepFinish({
      text: "partial",
      toolCalls: [{ toolName: "saveMemory", args: { key: "user_goal" } }],
      toolResults: [{ result: { saved: true } }],
    });

    expect(userOnStepFinish).toHaveBeenCalledWith({
      text: "partial",
      toolCalls: [{ toolName: "saveMemory", args: { key: "user_goal" } }],
      toolResults: [{ result: { saved: true } }],
    });

    await streamInput.onFinish({
      text: "assistant response",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      providerMetadata: { openrouter: { usage: { promptTokens: 10 } } },
    });

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-test",
      expect.any(Number),
      expect.objectContaining({
        text: "assistant response",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        ragUsed: true,
        ragChunksCount: 2,
        collectedToolCalls: [
          {
            name: "saveMemory",
            args: { key: "user_goal" },
            result: { saved: true },
          },
        ],
      }),
    );
    expect(userOnFinish).toHaveBeenCalledWith({
      text: "assistant response",
      metrics: expect.objectContaining({
        model: "google/gemini-test",
        ragUsed: true,
        ragChunksCount: 2,
      }),
    });
  });
});
