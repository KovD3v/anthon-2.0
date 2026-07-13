import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  messageMetricsCreate: vi.fn(),
  voiceGenerationJobCreate: vi.fn(),
  chatUpdate: vi.fn(),
  incrementUsage: vi.fn(),
  extractAndSaveMemories: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: {
      create: mocks.messageCreate,
    },
    messageMetrics: {
      create: mocks.messageMetricsCreate,
    },
    chat: {
      update: mocks.chatUpdate,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  incrementUsage: mocks.incrementUsage,
}));

vi.mock("@/lib/ai/memory-extractor", () => ({
  extractAndSaveMemories: mocks.extractAndSaveMemories,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

import { persistAssistantOutput } from "./persistence";

describe("channel-flow/persistence", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageMetricsCreate.mockReset();
    mocks.voiceGenerationJobCreate.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.extractAndSaveMemories.mockReset();
    mocks.revalidateTag.mockReset();

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        message: { create: mocks.messageCreate },
        messageMetrics: { create: mocks.messageMetricsCreate },
        voiceGenerationJob: { create: mocks.voiceGenerationJobCreate },
      }),
    );
    mocks.messageCreate.mockResolvedValue({ id: "msg-1" });
    mocks.messageMetricsCreate.mockResolvedValue({ id: "metrics-1" });
    mocks.voiceGenerationJobCreate.mockResolvedValue({ id: "voice-job-1" });
    mocks.chatUpdate.mockResolvedValue({});
    mocks.incrementUsage.mockResolvedValue({});
    mocks.extractAndSaveMemories.mockResolvedValue(undefined);
  });

  it("persists assistant message and post-process steps", async () => {
    const waitUntil = vi.fn();

    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 1,
        reasoningContent: "reasoning",
        toolCalls: [{ name: "tool", args: {} }],
        ragUsed: true,
        ragChunksCount: 2,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: 22,
      },
      metadata: { source: "test" },
      updateChatTimestamp: true,
      revalidateTags: ["chat-user-1", "chat-1"],
      allowMemoryExtraction: true,
      waitUntil,
    });

    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.incrementUsage).toHaveBeenCalledWith("user-1", 5, 8, 0.02, 1);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledWith(
      "user-1",
      "hello",
      "assistant",
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("creates the durable voice job in the same transaction as its transcript", async () => {
    const expiresAt = new Date("2026-07-14T10:00:00.000Z");

    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        reasoningContent: "",
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: 22,
      },
      voiceGeneration: { expiresAt },
    });

    expect(mocks.voiceGenerationJobCreate).toHaveBeenCalledWith({
      data: {
        messageId: "msg-1",
        userId: "user-1",
        expiresAt,
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("persists derived tool metrics in assistant metadata", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: null,
        reasoningContent: null,
        toolCalls: [
          {
            name: "tinyfishSearch",
            args: { query: "world cup" },
            result: {
              results: [{ title: "A", content: "abc" }],
            },
          },
        ],
        toolCallCount: 1,
        toolResultChars: 45,
        toolTiming: {
          firstModelStepMs: 120,
          toolExecutionMs: 340,
          finalModelStepMs: 560,
        },
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: null,
      },
      metadata: { source: "test" },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            source: "test",
            ai: {
              toolCallCount: 1,
              toolResultChars: 45,
              toolTiming: {
                firstModelStepMs: 120,
                toolExecutionMs: 340,
                finalModelStepMs: 560,
              },
            },
          },
        }),
      }),
    );
  });

  it("merges assistant AI metadata without deleting channel metadata", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WHATSAPP",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: null,
        reasoningContent: null,
        toolCalls: [],
        toolCallCount: 2,
        toolResultChars: 50,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: null,
      },
      metadata: {
        whatsapp: { messageId: "wa-1" },
        channel: "WHATSAPP",
        ai: { previous: "kept" },
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            whatsapp: { messageId: "wa-1" },
            channel: "WHATSAPP",
            ai: {
              previous: "kept",
              toolCallCount: 2,
              toolResultChars: 50,
            },
          },
        }),
      }),
    );
  });

  it("persists normalized message metrics and the selected provider", async () => {
    const providerMetadata = {
      openrouter: {
        provider: "Fireworks",
        usage: {
          promptTokens: 150,
          completionTokens: 30,
          cost: 0.003,
        },
      },
    };

    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        provider: "Fireworks",
        providerMetadata,
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 5,
        reasoningContent: "reasoning",
        toolCalls: [{ name: "tinyfishSearch", args: { query: "race" } }],
        toolCallCount: 1,
        toolResultChars: 123,
        toolTiming: {
          firstModelStepMs: 120,
          toolExecutionMs: 340,
          finalModelStepMs: 560,
        },
        ragUsed: true,
        ragChunksCount: 4,
        costUsd: 0.003,
        generationTimeMs: 1000,
        reasoningTimeMs: 50,
      } as never,
      allowMemoryExtraction: false,
    });

    expect(mocks.messageMetricsCreate).toHaveBeenCalledWith({
      data: {
        messageId: "msg-1",
        model: "test-model",
        provider: "Fireworks",
        inputTokens: 100,
        outputTokens: 30,
        totalTokens: 130,
        reasoningTokens: 5,
        costUsd: 0.003,
        generationTimeMs: 1000,
        reasoningTimeMs: 50,
        toolCallCount: 1,
        toolResultChars: 123,
        toolTiming: {
          firstModelStepMs: 120,
          toolExecutionMs: 340,
          finalModelStepMs: 560,
        },
        ragUsed: true,
        ragChunksCount: 4,
        providerMetadata,
      },
    });
  });

  it("persists provider selected from normalized OpenRouter selected_provider metadata", async () => {
    const providerMetadata = {
      openrouter: {
        selected_provider: "Nebius",
        usage: {
          promptTokens: 120,
          completionTokens: 30,
          cost: 0.002,
        },
      },
    };

    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        provider: "Nebius",
        providerMetadata,
        inputTokens: 120,
        outputTokens: 30,
        reasoningTokens: null,
        reasoningContent: null,
        toolCalls: null,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.002,
        generationTimeMs: 500,
        reasoningTimeMs: null,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageMetricsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "Nebius",
          providerMetadata,
        }),
      }),
    );
  });

  it("skips chat update and memory extraction when disabled", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "TELEGRAM",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        reasoningContent: "",
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.chatUpdate).not.toHaveBeenCalled();
    expect(mocks.extractAndSaveMemories).not.toHaveBeenCalled();
  });

  it("returns the assistant message when chat timestamp update fails after create", async () => {
    mocks.messageCreate.mockResolvedValue({ id: "msg-created" });
    mocks.chatUpdate.mockRejectedValue(new Error("chat update failed"));

    const result = await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 0,
        reasoningContent: "",
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      updateChatTimestamp: true,
      allowMemoryExtraction: false,
    });

    expect(result).toEqual({ id: "msg-created" });
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
  });

  it("returns the assistant message when usage increment fails after create", async () => {
    mocks.messageCreate.mockResolvedValue({ id: "msg-created" });
    mocks.incrementUsage.mockRejectedValue(new Error("usage failed"));

    const result = await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 0,
        reasoningContent: "",
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: true,
    });

    expect(result).toEqual({ id: "msg-created" });
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledTimes(1);
  });
});
