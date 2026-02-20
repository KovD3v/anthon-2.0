import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageCreate: vi.fn(),
  chatUpdate: vi.fn(),
  incrementUsage: vi.fn(),
  extractAndSaveMemories: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      create: mocks.messageCreate,
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
    mocks.messageCreate.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.extractAndSaveMemories.mockReset();
    mocks.revalidateTag.mockReset();

    mocks.messageCreate.mockResolvedValue({ id: "msg-1" });
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
    expect(mocks.incrementUsage).toHaveBeenCalledWith("user-1", 5, 8, 0.02);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledWith(
      "user-1",
      "hello",
      "assistant",
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
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
});
