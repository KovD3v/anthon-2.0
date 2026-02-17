import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  persistAssistantOutput: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  streamChat: mocks.streamChat,
}));

vi.mock("./persistence", () => ({
  persistAssistantOutput: mocks.persistAssistantOutput,
}));

import { runChannelFlow } from "./run";

describe("channel-flow/run", () => {
  beforeEach(() => {
    mocks.streamChat.mockReset();
    mocks.persistAssistantOutput.mockReset();
  });

  it("returns stream result in stream mode", async () => {
    const streamResult = {
      toUIMessageStreamResponse: () => Response.json({ ok: true }),
      textStream: (async function* () {
        yield "ignored";
      })(),
    };

    mocks.streamChat.mockResolvedValue(streamResult);

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      ai: {
        planId: "basic",
        userRole: "USER",
        isGuest: false,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(result.streamResult).toBe(streamResult);
    expect(result.assistantText).toBe("");
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        chatId: "chat-1",
        userMessage: "hello",
      }),
    );
  });

  it("consumes text stream and persists assistant output in text mode", async () => {
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "final answer",
        metrics: {
          model: "test-model",
          inputTokens: 10,
          outputTokens: 20,
          reasoningTokens: 0,
          reasoningContent: "",
          toolCalls: [],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 100,
          reasoningTimeMs: 0,
        },
      });

      return {
        textStream: (async function* () {
          yield "final";
          yield " answer";
        })(),
      };
    });

    const hookSpy = vi.fn();

    const result = await runChannelFlow({
      channel: "WHATSAPP",
      userId: "user-1",
      userMessageText: "ciao",
      parts: [{ type: "text", text: "ciao" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "text" },
      persistence: {
        channel: "WHATSAPP",
        saveAssistantMessage: true,
      },
      hooks: {
        onFinish: hookSpy,
      },
    });

    expect(result.assistantText).toBe("final answer");
    expect(mocks.persistAssistantOutput).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledTimes(1);
  });

  it("skips persistence when saveAssistantMessage is false", async () => {
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "no-store",
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
      });
      return {
        textStream: (async function* () {
          yield "no-store";
        })(),
      };
    });

    await runChannelFlow({
      channel: "TELEGRAM",
      userId: "user-1",
      userMessageText: "no-store",
      parts: [{ type: "text", text: "no-store" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "text" },
      persistence: {
        channel: "TELEGRAM",
        saveAssistantMessage: false,
      },
    });

    expect(mocks.persistAssistantOutput).not.toHaveBeenCalled();
  });
});
