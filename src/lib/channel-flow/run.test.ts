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
    const toUIMessageStreamResponse = vi.fn(() => Response.json({ ok: true }));
    const streamResult = {
      toUIMessageStreamResponse,
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

    expect(result.streamResult?.textStream).toBe(streamResult.textStream);
    expect(result.streamResult?.toUIMessageStreamResponse()).toBeInstanceOf(
      Response,
    );
    expect(toUIMessageStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messageMetadata: expect.any(Function),
      }),
    );
    expect(result.assistantText).toBe("");
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        chatId: "chat-1",
        userMessage: "hello",
      }),
    );
  });

  it("adds finish usage metadata to streamed UI responses", async () => {
    let onFinish:
      | ((input: {
          text: string;
          metrics: {
            model: string;
            inputTokens: number;
            outputTokens: number;
            reasoningTokens: number | null;
            reasoningContent: string | null;
            toolCalls: null;
            ragUsed: boolean;
            ragChunksCount: number;
            costUsd: number;
            generationTimeMs: number;
            reasoningTimeMs: number | null;
          };
        }) => Promise<void>)
      | undefined;
    const toUIMessageStreamResponse = vi.fn(() => Response.json({ ok: true }));
    mocks.streamChat.mockImplementation(async (input) => {
      onFinish = input.onFinish;
      return {
        toUIMessageStreamResponse,
        textStream: (async function* () {
          yield "ignored";
        })(),
      };
    });

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
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: false,
      },
    });

    await onFinish?.({
      text: "assistant",
      metrics: {
        model: "openai/gpt-chat-latest",
        inputTokens: 123,
        outputTokens: 45,
        reasoningTokens: null,
        reasoningContent: null,
        toolCalls: null,
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.01,
        generationTimeMs: 3210,
        reasoningTimeMs: null,
      },
    });
    result.streamResult?.toUIMessageStreamResponse();

    const metadata =
      toUIMessageStreamResponse.mock.calls[0]?.[0]?.messageMetadata({
        part: {
          type: "finish",
          totalUsage: { inputTokens: 1, outputTokens: 2 },
        },
      });

    expect(metadata).toEqual({
      inputTokens: 123,
      outputTokens: 45,
      generationTimeMs: 3210,
      reasoningTimeMs: undefined,
    });
  });

  it("passes memory availability from channel options to the orchestrator", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB_GUEST",
      userId: "guest-1",
      chatId: "chat-1",
      userMessageText: "ciao",
      parts: [{ type: "text", text: "ciao" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: false,
        allowVoiceOutput: false,
      },
      ai: {
        isGuest: true,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "guest-1",
        isGuest: true,
        memoryEnabled: false,
      }),
    );
  });

  it("passes first-message history skip to the orchestrator", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB_GUEST",
      userId: "guest-1",
      chatId: "chat-new",
      userMessageText: "ciao",
      parts: [{ type: "text", text: "ciao" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: false,
        allowVoiceOutput: false,
      },
      ai: {
        isGuest: true,
        skipConversationHistory: true,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-new",
        skipConversationHistory: true,
      }),
    );
  });

  it("removes file parts and media hints when attachments are disabled", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB_GUEST",
      userId: "guest-1",
      chatId: "chat-1",
      userMessageText: "caption",
      parts: [
        { type: "text", text: "caption" },
        {
          type: "file",
          data: "image-base64",
          mimeType: "image/png",
          name: "photo.png",
        },
        {
          type: "file",
          data: "audio-base64",
          mimeType: "audio/ogg",
          name: "voice.ogg",
        },
      ],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: false,
        allowVoiceOutput: false,
      },
      ai: {
        hasImages: true,
        hasAudio: true,
        isGuest: true,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messageParts: [{ type: "text", text: "caption" }],
        hasImages: false,
        hasAudio: false,
      }),
    );
  });

  it("forces text response settings when voice output is disabled", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "TELEGRAM",
      userId: "user-1",
      userMessageText: "say it",
      parts: [{ type: "text", text: "say it" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: false,
      },
      ai: {
        responseMode: "voice",
        voiceEnabled: true,
      },
      execution: { mode: "text" },
      persistence: {
        channel: "TELEGRAM",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: "text",
        voiceEnabled: false,
      }),
    );
  });

  it("does not call the AI or persist output when rate limit is denied", async () => {
    const result = await runChannelFlow({
      channel: "TELEGRAM",
      userId: "user-1",
      userMessageText: "blocked",
      parts: [{ type: "text", text: "blocked" }],
      rateLimit: {
        allowed: false,
        upgradeInfo: { ctaMessage: "Upgrade" },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "text" },
      persistence: {
        channel: "TELEGRAM",
        saveAssistantMessage: true,
      },
    });

    expect(result).toEqual({
      assistantText: "",
      persistence: { status: "skipped" },
      rateLimit: {
        status: "denied",
        upgradeInfo: { ctaMessage: "Upgrade" },
      },
    });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.persistAssistantOutput).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "web stream",
      input: {
        channel: "WEB" as const,
        userId: "user-web",
        chatId: "chat-web",
        userMessageText: "ciao web",
        parts: [
          { type: "text" as const, text: "ciao web" },
          {
            type: "file" as const,
            data: "image-base64",
            mimeType: "image/png",
            name: "photo.png",
          },
        ],
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        ai: {
          planId: "basic",
          userRole: "USER",
          subscriptionStatus: "ACTIVE",
          isGuest: false,
        },
        execution: { mode: "stream" as const },
        persistence: {
          channel: "WEB" as const,
          saveAssistantMessage: true,
          metadata: { web: { inReplyTo: "msg-web" } },
        },
      },
      expected: {
        hasImages: true,
        hasAudio: false,
        memoryEnabled: true,
        responseMode: "text",
        persistenceChannel: "WEB",
      },
    },
    {
      name: "guest web stream",
      input: {
        channel: "WEB_GUEST" as const,
        userId: "guest-web",
        chatId: "chat-guest",
        userMessageText: "ciao guest",
        parts: [{ type: "text" as const, text: "ciao guest" }],
        options: {
          allowAttachments: false,
          allowMemoryExtraction: false,
          allowVoiceOutput: false,
        },
        ai: {
          isGuest: true,
          skipConversationHistory: true,
        },
        execution: { mode: "stream" as const },
        persistence: {
          channel: "WEB" as const,
          saveAssistantMessage: true,
          metadata: { web: { guest: true } },
        },
      },
      expected: {
        hasImages: false,
        hasAudio: false,
        memoryEnabled: false,
        responseMode: "text",
        persistenceChannel: "WEB",
      },
    },
    {
      name: "telegram text",
      input: {
        channel: "TELEGRAM" as const,
        userId: "user-tg",
        userMessageText: "ciao telegram",
        parts: [{ type: "text" as const, text: "ciao telegram" }],
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        execution: { mode: "text" as const },
        persistence: {
          channel: "TELEGRAM" as const,
          saveAssistantMessage: true,
          metadata: { telegram: { inReplyTo: "msg-tg" } },
        },
      },
      expected: {
        hasImages: false,
        hasAudio: false,
        memoryEnabled: true,
        responseMode: "text",
        persistenceChannel: "TELEGRAM",
      },
    },
    {
      name: "whatsapp text",
      input: {
        channel: "WHATSAPP" as const,
        userId: "user-wa",
        userMessageText: "ciao whatsapp",
        parts: [{ type: "text" as const, text: "ciao whatsapp" }],
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        execution: { mode: "text" as const },
        persistence: {
          channel: "WHATSAPP" as const,
          saveAssistantMessage: true,
          metadata: { whatsapp: { inReplyTo: "msg-wa" } },
        },
      },
      expected: {
        hasImages: false,
        hasAudio: false,
        memoryEnabled: true,
        responseMode: "text",
        persistenceChannel: "WHATSAPP",
      },
    },
  ])(
    "passes canonical AI and persistence fields for $name",
    async (testCase) => {
      mocks.streamChat.mockImplementation(async ({ onFinish }) => {
        await onFinish?.({
          text: "contract answer",
          metrics: {
            model: "test-model",
            inputTokens: 1,
            outputTokens: 2,
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
          toUIMessageStreamResponse: () => Response.json({ ok: true }),
          textStream: (async function* () {
            yield "contract answer";
          })(),
        };
      });

      await runChannelFlow({
        ...testCase.input,
        rateLimit: {
          allowed: true,
          effectiveEntitlements: {
            modelTier: "BASIC",
            limits: {
              maxRequestsPerDay: 10,
              maxInputTokensPerDay: 1000,
              maxOutputTokensPerDay: 1000,
              maxCostPerDay: 1,
              maxContextMessages: 20,
            },
            sources: [],
          },
        },
      });

      expect(mocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testCase.input.userId,
          chatId: testCase.input.chatId,
          userMessage: testCase.input.userMessageText,
          messageParts: testCase.input.parts,
          effectiveEntitlements: expect.objectContaining({
            modelTier: "BASIC",
          }),
          isGuest: testCase.input.ai?.isGuest,
          memoryEnabled: testCase.expected.memoryEnabled,
          hasImages: testCase.expected.hasImages,
          hasAudio: testCase.expected.hasAudio,
          responseMode: testCase.expected.responseMode,
          skipConversationHistory: testCase.input.ai?.skipConversationHistory,
        }),
      );

      expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testCase.input.userId,
          chatId: testCase.input.chatId,
          channel: testCase.expected.persistenceChannel,
          text: "contract answer",
          userMessageText: testCase.input.userMessageText,
          metadata: testCase.input.persistence.metadata,
          allowMemoryExtraction: testCase.expected.memoryEnabled,
        }),
      );
    },
  );

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

  it("returns failed persistence status when assistant output cannot be saved", async () => {
    const persistenceError = new Error("database is unavailable");

    mocks.persistAssistantOutput.mockRejectedValue(persistenceError);
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "answer without persistence",
        metrics: {
          model: "test-model",
          inputTokens: 1,
          outputTokens: 2,
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
          yield "answer without persistence";
        })(),
      };
    });

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
    });

    expect(result.assistantText).toBe("answer without persistence");
    expect(result.persistence).toEqual({
      status: "failed",
      error: persistenceError,
    });
  });
});
