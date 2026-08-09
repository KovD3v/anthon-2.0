import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  persistAssistantOutput: vi.fn(),
  reserveAiUsage: vi.fn(),
  releaseAiUsageReservation: vi.fn(),
  reconcileAiUsageForRecovery: vi.fn(),
  getImmediatelyAttributableApproval: vi.fn(),
  mightResolvePendingMemoryApproval: vi.fn(),
  resolveExactMemoryDeleteTarget: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  streamChat: mocks.streamChat,
}));

vi.mock("./persistence", () => ({
  persistAssistantOutput: mocks.persistAssistantOutput,
}));

vi.mock("@/lib/rate-limit", () => ({
  reserveAiUsage: mocks.reserveAiUsage,
  releaseAiUsageReservation: mocks.releaseAiUsageReservation,
  reconcileAiUsageForRecovery: mocks.reconcileAiUsageForRecovery,
}));

vi.mock("@/lib/ai/memory-approval", () => ({
  getImmediatelyAttributableApproval: mocks.getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval: mocks.mightResolvePendingMemoryApproval,
}));

vi.mock("@/lib/ai/memory-target", () => ({
  resolveExactMemoryDeleteTarget: mocks.resolveExactMemoryDeleteTarget,
}));

import type { CapabilityDecision } from "@/lib/ai/capability-arbitration";
import { runChannelFlow } from "./run";

type StreamResponseOptions = {
  messageMetadata?: (input: { part: unknown }) => unknown;
};

describe("channel-flow/run", () => {
  beforeEach(() => {
    mocks.streamChat.mockReset();
    mocks.persistAssistantOutput.mockReset();
    mocks.reserveAiUsage.mockReset();
    mocks.releaseAiUsageReservation.mockReset();
    mocks.reconcileAiUsageForRecovery.mockReset();
    mocks.getImmediatelyAttributableApproval.mockReset();
    mocks.mightResolvePendingMemoryApproval.mockReset();
    mocks.resolveExactMemoryDeleteTarget.mockReset();
    mocks.reserveAiUsage.mockResolvedValue(undefined);
    mocks.releaseAiUsageReservation.mockResolvedValue(true);
    mocks.reconcileAiUsageForRecovery.mockResolvedValue({ charged: true });
    mocks.getImmediatelyAttributableApproval.mockResolvedValue(null);
    mocks.mightResolvePendingMemoryApproval.mockImplementation((text: string) =>
      /salv|memorizz|ricord|conferm|rifiut/i.test(text),
    );
    mocks.resolveExactMemoryDeleteTarget.mockResolvedValue(null);
    mocks.persistAssistantOutput.mockResolvedValue({ id: "assistant-1" });
  });

  it("returns stream result in stream mode", async () => {
    const toUIMessageStreamResponse = vi.fn((_?: StreamResponseOptions) =>
      Response.json({ ok: true }),
    );
    const streamResult = {
      toUIMessageStreamResponse,
      toUIMessageStream: () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
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
    expect(toUIMessageStreamResponse).not.toHaveBeenCalled();
    expect(result.assistantText).toBe("");
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        chatId: "chat-1",
        userMessage: "hello",
      }),
    );
  });

  it("passes the exact streamed decision to persistence without rereading planner mode", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "legacy");
    const capabilityDecision = Object.freeze({
      rag: false,
      webSearch: true,
      webFetch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      memoryDeleteTarget: null,
      routineProposal: false,
      userContext: false,
      voiceOutput: false,
      source: "classifier" as const,
      reasonCodes: Object.freeze([]),
    }) as unknown as CapabilityDecision;
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "answer",
        metrics: {
          model: "test-model",
          inputTokens: 1,
          outputTokens: 1,
          reasoningTokens: null,
          reasoningContent: null,
          toolCalls: [{ name: "tinyfishSearch", status: "completed" }],
          capabilitiesUsed: ["web"],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0,
          generationTimeMs: 1,
          reasoningTimeMs: null,
        },
        capabilityDecision,
        capabilityPlannerMode: "agentic",
      });
      return {
        textStream: (async function* () {
          yield "answer";
        })(),
      };
    });

    const result = await runChannelFlow({
      channel: "TELEGRAM",
      userId: "user-1",
      conversationThreadId: "thread-1",
      userMessageId: "message-1",
      userMessageText: "latest result",
      parts: [{ type: "text", text: "latest result" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: true,
        allowVoiceOutput: false,
      },
      execution: { mode: "text" },
      persistence: { channel: "TELEGRAM", saveAssistantMessage: true },
    });

    expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityDecision,
        capabilityPlannerMode: "agentic",
      }),
    );
    expect(
      mocks.persistAssistantOutput.mock.calls[0]?.[0].capabilityDecision,
    ).toBe(capabilityDecision);
    expect(result.capabilityDecision).toBe(capabilityDecision);
    expect(result.capabilityPlannerMode).toBe("agentic");
  });

  it("returns capability context synchronously for a live stream", async () => {
    const capabilityDecision = Object.freeze({
      rag: false,
      webSearch: false,
      webFetch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      memoryDeleteTarget: null,
      routineProposal: false,
      userContext: true,
      voiceOutput: false,
      source: "classifier" as const,
      reasonCodes: Object.freeze([]),
    }) as unknown as CapabilityDecision;
    mocks.streamChat.mockResolvedValue({
      capabilityDecision,
      capabilityPlannerMode: "agentic",
      textStream: (async function* () {
        yield "answer";
      })(),
      toUIMessageStream: () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    expect(result.capabilityDecision).toBe(capabilityDecision);
    expect(result.capabilityPlannerMode).toBe("agentic");
  });

  it("passes a prepared comparison decision into the normal flow unchanged", async () => {
    const capabilityDecision = Object.freeze({
      rag: false,
      webSearch: true,
      webFetch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      memoryDeleteTarget: null,
      routineProposal: false,
      userContext: false,
      voiceOutput: false,
      source: "classifier" as const,
      reasonCodes: Object.freeze([]),
    }) as unknown as CapabilityDecision;
    mocks.streamChat.mockResolvedValue({
      capabilityDecision,
      capabilityPlannerMode: "agentic",
      textStream: (async function* () {})(),
      toUIMessageStream: () => new ReadableStream(),
    });

    await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      userMessageText: "latest result",
      parts: [{ type: "text", text: "latest result" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      ai: {
        preparedCapabilityContext: {
          capabilityDecision,
          capabilityPlannerMode: "agentic",
        },
      },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        preparedCapabilityContext: {
          capabilityDecision,
          capabilityPlannerMode: "agentic",
        },
      }),
    );
  });

  it("removes tool payloads from the shared live UI stream", async () => {
    mocks.streamChat.mockImplementation(async ({ onFinish }) => ({
      textStream: (async function* () {
        yield "answer";
      })(),
      toUIMessageStream: () =>
        new ReadableStream({
          async start(controller) {
            controller.enqueue({
              type: "tool-input-available",
              toolCallId: "call-1",
              toolName: "saveMemory",
              input: {
                key: "health_condition",
                value: "Diagnosi privata",
              },
            });
            controller.enqueue({
              type: "tool-output-available",
              toolCallId: "call-1",
              output: {
                status: "approval_required",
                approvalId: "approval-1",
              },
            });
            await onFinish?.({
              text: "answer",
              metrics: {
                model: "test-model",
                inputTokens: 1,
                outputTokens: 1,
                reasoningTokens: null,
                reasoningContent: null,
                toolCalls: [{ name: "saveMemory", status: "completed" }],
                ragUsed: false,
                ragChunksCount: 0,
                costUsd: 0,
                generationTimeMs: 1,
                reasoningTimeMs: null,
              },
            });
            controller.close();
          },
        }),
    }));

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: false,
      },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    const body = await result.streamResult?.toUIMessageStreamResponse().text();

    expect(body).toContain('"input":{}');
    expect(body).toContain('"output":{"status":"completed"}');
    expect(body).toContain("safe-tool-1");
    expect(body).not.toContain("call-1");
    expect(body).not.toContain("health_condition");
    expect(body).not.toContain("Diagnosi privata");
    expect(body).not.toContain("approval-1");
  });

  it("drops reasoning and provider metadata while preserving streamed text", async () => {
    const toUIMessageStream = vi.fn(
      () =>
        new ReadableStream({
          async start(controller) {
            controller.enqueue({
              type: "start",
              messageId: "provider-message-id",
              messageMetadata: { providerRequestId: "provider-request-1" },
            });
            controller.enqueue({
              type: "reasoning-start",
              id: "provider-reasoning-id",
            });
            controller.enqueue({
              type: "reasoning-delta",
              id: "provider-reasoning-id",
              delta: "private chain of thought",
              providerMetadata: { openrouter: { id: "provider-request-1" } },
            });
            controller.enqueue({
              type: "text-start",
              id: "provider-text-id",
              providerMetadata: { openrouter: { id: "provider-request-1" } },
            });
            controller.enqueue({
              type: "text-delta",
              id: "provider-text-id",
              delta: "Risposta legittima",
              providerMetadata: { openrouter: { id: "provider-request-1" } },
            });
            controller.enqueue({
              type: "text-end",
              id: "provider-text-id",
              providerMetadata: { openrouter: { id: "provider-request-1" } },
            });
            controller.enqueue({
              type: "message-metadata",
              messageMetadata: { providerRequestId: "provider-request-1" },
            });
            await mocks.streamChat.mock.calls[0]?.[0].onFinish?.({
              text: "Risposta legittima",
              metrics: {
                model: "test-model",
                inputTokens: 1,
                outputTokens: 2,
                reasoningTokens: 10,
                reasoningContent: "private chain of thought",
                toolCalls: null,
                ragUsed: false,
                ragChunksCount: 0,
                costUsd: 0,
                generationTimeMs: 1,
                reasoningTimeMs: 1,
              },
            });
            controller.close();
          },
        }),
    );
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "Risposta legittima";
      })(),
      toUIMessageStream,
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: false,
      },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    const body = await result.streamResult?.toUIMessageStreamResponse().text();

    expect(toUIMessageStream).toHaveBeenCalledWith({
      sendFinish: false,
      sendReasoning: false,
    });
    expect(body).toContain("Risposta legittima");
    expect(body).toContain("safe-text-1");
    expect(body).not.toContain("private chain of thought");
    expect(body).not.toContain("provider-request-1");
    expect(body).not.toContain("provider-message-id");
    expect(body).not.toContain("provider-text-id");
    expect(body).not.toContain("provider-reasoning-id");
  });

  it.each([
    {
      name: "when omitted",
      includeTechnicalMetrics: undefined,
      expected: false,
    },
    { name: "when false", includeTechnicalMetrics: false, expected: false },
    { name: "when true", includeTechnicalMetrics: true, expected: true },
  ])(
    "includes finish usage metadata only $name while persisting metrics",
    async (testCase) => {
      let onFinish:
        | ((input: {
            text: string;
            metrics: {
              model: string;
              inputTokens: number;
              outputTokens: number;
              reasoningTokens: number | null;
              reasoningContent: string | null;
              providerMetadata?: Record<string, unknown>;
              toolCalls: null;
              ragUsed: boolean;
              ragChunksCount: number;
              costUsd: number;
              generationTimeMs: number;
              reasoningTimeMs: number | null;
              capabilitiesUsed?: string[];
            };
          }) => Promise<void>)
        | undefined;
      const toUIMessageStreamResponse = vi.fn((_?: StreamResponseOptions) =>
        Response.json({ ok: true }),
      );
      mocks.streamChat.mockImplementation(async (input) => {
        onFinish = input.onFinish;
        return {
          toUIMessageStreamResponse,
          toUIMessageStream: () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
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
        execution: {
          mode: "stream",
          ...(testCase.includeTechnicalMetrics === undefined
            ? {}
            : { includeTechnicalMetrics: testCase.includeTechnicalMetrics }),
        },
        persistence: {
          channel: "WEB",
          saveAssistantMessage: true,
        },
      });

      await onFinish?.({
        text: "assistant",
        metrics: {
          model: "z-ai/glm-4.7",
          inputTokens: 123,
          outputTokens: 45,
          reasoningTokens: null,
          reasoningContent: "SECRET_FINISH_REASONING",
          providerMetadata: {
            openrouter: { requestId: "SECRET_FINISH_PROVIDER" },
          },
          toolCalls: null,
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 3210,
          reasoningTimeMs: null,
          capabilitiesUsed: ["memory", "voice"],
        },
      });
      const response = result.streamResult?.toUIMessageStreamResponse();
      const body = await response?.text();

      expect(toUIMessageStreamResponse).not.toHaveBeenCalled();
      if (testCase.expected) {
        expect(body).toContain("inputTokens");
        expect(body).toContain("123");
        expect(body).toContain("outputTokens");
        expect(body).toContain("45");
      } else {
        expect(body).not.toContain("inputTokens");
        expect(body).not.toContain("outputTokens");
      }
      expect(body).not.toContain("SECRET_FINISH_REASONING");
      expect(body).not.toContain("SECRET_FINISH_PROVIDER");
      expect(body).not.toContain('"voice"');
      expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "assistant",
          metrics: expect.objectContaining({
            inputTokens: 123,
            outputTokens: 45,
            costUsd: 0.01,
          }),
        }),
      );
    },
  );

  it.each([
    {
      name: "recovery by default",
      includeTechnicalMetrics: undefined,
      includesTechnicalMetrics: false,
      reservation: {
        recovery: {
          text: "recovered answer",
          metrics: {
            model: "recovered-model",
            inputTokens: 10,
            outputTokens: 4,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 100,
            reasoningTimeMs: null,
          },
        },
      },
    },
    {
      name: "persisted replay by default",
      includeTechnicalMetrics: undefined,
      includesTechnicalMetrics: false,
      reservation: {
        persistedAssistant: {
          messageId: "assistant-saved",
          text: "saved answer",
          metrics: {
            model: "saved-model",
            inputTokens: 8,
            outputTokens: 3,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 90,
            reasoningTimeMs: null,
          },
        },
      },
    },
    {
      name: "recovery when explicitly enabled",
      includeTechnicalMetrics: true,
      includesTechnicalMetrics: true,
      reservation: {
        recovery: {
          text: "recovered answer",
          metrics: {
            model: "recovered-model",
            inputTokens: 10,
            outputTokens: 4,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 100,
            reasoningTimeMs: null,
          },
        },
      },
    },
    {
      name: "persisted replay when explicitly enabled",
      includeTechnicalMetrics: true,
      includesTechnicalMetrics: true,
      reservation: {
        persistedAssistant: {
          messageId: "assistant-saved",
          text: "saved answer",
          metrics: {
            model: "saved-model",
            inputTokens: 8,
            outputTokens: 3,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 90,
            reasoningTimeMs: null,
          },
        },
      },
    },
  ])("exposes $name metadata only when enabled", async (testCase) => {
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
      ...testCase.reservation,
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: {
        mode: "stream",
        ...(testCase.includeTechnicalMetrics === undefined
          ? {}
          : { includeTechnicalMetrics: testCase.includeTechnicalMetrics }),
      },
      persistence: { channel: "WEB", saveAssistantMessage: true },
    });

    const body = await result.streamResult?.toUIMessageStreamResponse().text();

    if (testCase.includesTechnicalMetrics) {
      expect(body).toContain("inputTokens");
      expect(body).toContain("outputTokens");
    } else {
      expect(body).not.toContain("inputTokens");
      expect(body).not.toContain("outputTokens");
    }
    if ("recovery" in testCase.reservation) {
      expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({ inputTokens: 10 }),
        }),
      );
    }
  });

  it.each([
    {
      name: "recovery",
      databaseMessageId: "db-recovered-assistant-secret",
      text: "recovered answer",
      reservation: {
        recovery: {
          text: "recovered answer",
          metrics: {
            model: "recovered-model",
            inputTokens: 10,
            outputTokens: 4,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 100,
            reasoningTimeMs: null,
          },
        },
      },
    },
    {
      name: "persisted assistant replay",
      databaseMessageId: "db-replayed-assistant-secret",
      text: "saved answer",
      reservation: {
        persistedAssistant: {
          messageId: "db-replayed-assistant-secret",
          text: "saved answer",
          metrics: {
            model: "saved-model",
            inputTokens: 8,
            outputTokens: 3,
            reasoningTokens: null,
            reasoningContent: null,
            toolCalls: null,
            ragUsed: false,
            ragChunksCount: 0,
            costUsd: 0.01,
            generationTimeMs: 90,
            reasoningTimeMs: null,
          },
        },
      },
    },
  ])("uses only synthetic UI stream IDs for $name", async (testCase) => {
    mocks.persistAssistantOutput.mockResolvedValue({
      id: testCase.databaseMessageId,
    });
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
      ...testCase.reservation,
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream", includeTechnicalMetrics: true },
      persistence: { channel: "WEB", saveAssistantMessage: true },
    });

    const body = await result.streamResult?.toUIMessageStreamResponse().text();

    expect(body).toBeDefined();
    if (!body) throw new Error("Expected a persisted UI stream response");

    expect(body).not.toContain(testCase.databaseMessageId);
    expect(body).not.toContain(`${testCase.databaseMessageId}-text`);
    const safeMessageId = body.match(
      /"type":"start","messageId":"(safe-message-[^"]+)"/,
    )?.[1];
    const safeTextId = body.match(
      /"type":"text-start","id":"(safe-text-[^"]+)"/,
    )?.[1];
    expect(safeMessageId).toBeDefined();
    expect(safeTextId).toBeDefined();
    expect(body).toContain('"type":"start-step"');
    expect(body).toContain(
      `"type":"text-delta","id":"${safeTextId}","delta":"${testCase.text}"`,
    );
    expect(body).toContain(`"type":"text-end","id":"${safeTextId}"`);
    expect(body).toContain('"type":"finish-step"');
    expect(body).toContain('"type":"finish","finishReason":"stop"');
    expect(body).toContain('"inputTokens"');
    expect(body).toContain('"outputTokens"');
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

  it.each([
    { channel: "WEB" as const, persistenceChannel: "WEB" as const },
    {
      channel: "TELEGRAM" as const,
      persistenceChannel: "TELEGRAM" as const,
    },
    {
      channel: "WHATSAPP" as const,
      persistenceChannel: "WHATSAPP" as const,
    },
  ])(
    "loads the same server-owned immediate approval context for $channel",
    async ({ channel, persistenceChannel }) => {
      const pendingApproval = {
        id: "approval-1",
        userId: "user-1",
        sourceInboundMessageId: "inbound-source",
        key: "knee_injury",
        value: "Dolore al ginocchio",
        category: "health",
        confidence: 0.92,
        expiresAt: new Date("2026-08-09T18:15:00.000Z"),
      };
      mocks.getImmediatelyAttributableApproval.mockResolvedValueOnce(
        pendingApproval,
      );
      mocks.streamChat.mockResolvedValue({
        textStream: (async function* () {
          yield "";
        })(),
        toUIMessageStream: () =>
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
      });

      await runChannelFlow({
        channel,
        userId: "user-1",
        chatId: channel === "WEB" ? "chat-1" : undefined,
        conversationThreadId: "thread-1",
        userMessageId: "inbound-current",
        userMessageText: "Sì, salvalo in memoria.",
        parts: [{ type: "text", text: "Sì, salvalo in memoria." }],
        rateLimit: { allowed: true },
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        ai: { isGuest: false },
        execution: { mode: "stream" },
        persistence: {
          channel: persistenceChannel,
          saveAssistantMessage: true,
        },
      });

      expect(mocks.getImmediatelyAttributableApproval).toHaveBeenCalledWith({
        userId: "user-1",
        conversationId: "thread-1",
        currentUserMessageId: "inbound-current",
      });
      expect(mocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingMemoryApproval: pendingApproval,
          userMessageId: "inbound-current",
        }),
      );
    },
  );

  it("does not query pending approvals for an unrelated authenticated turn", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "answer";
      })(),
    });

    await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      conversationThreadId: "thread-1",
      userMessageId: "inbound-current",
      userMessageText: "Aiutami a prepararmi per la partita.",
      parts: [{ type: "text", text: "Aiutami a prepararmi per la partita." }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: false,
      },
      ai: { isGuest: false },
      execution: { mode: "text" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    expect(mocks.getImmediatelyAttributableApproval).not.toHaveBeenCalled();
  });

  it("never loads approval context for a guest or from inbound client options", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB_GUEST",
      userId: "guest-1",
      chatId: "chat-1",
      conversationThreadId: "thread-1",
      userMessageId: "inbound-current",
      userMessageText: "Sì, salvalo.",
      parts: [{ type: "text", text: "Sì, salvalo." }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: false,
        allowVoiceOutput: false,
      },
      ai: { isGuest: true },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: true },
    });

    expect(mocks.getImmediatelyAttributableApproval).not.toHaveBeenCalled();
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.not.objectContaining({ pendingMemoryApproval: expect.anything() }),
    );
  });

  it.each([
    { label: "omitted", ai: undefined },
    { label: "false", ai: { isGuest: false } },
  ])(
    "never resolves memory capabilities for WEB_GUEST when isGuest is $label",
    async ({ ai }) => {
      mocks.streamChat.mockImplementation(async ({ onFinish }) => {
        await onFinish?.({
          text: "answer",
          metrics: {
            inputTokens: 1,
            outputTokens: 1,
            generationTimeMs: 1,
          },
        });
        return {
          textStream: (async function* () {
            yield "answer";
          })(),
        };
      });

      await runChannelFlow({
        channel: "WEB_GUEST",
        userId: "guest-1",
        conversationThreadId: "thread-1",
        userMessageId: "inbound-current",
        userMessageText: "Dimentica training_schedule.",
        parts: [{ type: "text", text: "Dimentica training_schedule." }],
        rateLimit: { allowed: true },
        options: {
          allowAttachments: false,
          allowMemoryExtraction: true,
          allowVoiceOutput: false,
        },
        ai,
        execution: { mode: "text" },
        persistence: { channel: "WEB", saveAssistantMessage: true },
      });

      expect(mocks.getImmediatelyAttributableApproval).not.toHaveBeenCalled();
      expect(mocks.resolveExactMemoryDeleteTarget).not.toHaveBeenCalled();
      expect(mocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          isGuest: true,
          memoryEnabled: false,
        }),
      );
      expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
        expect.objectContaining({ allowMemoryExtraction: false }),
      );
    },
  );

  it.each(["WEB", "TELEGRAM", "WHATSAPP"] as const)(
    "passes only the server-resolved exact deletion target through %s",
    async (channel) => {
      mocks.resolveExactMemoryDeleteTarget.mockResolvedValueOnce(
        "training_schedule",
      );
      mocks.streamChat.mockResolvedValue({
        textStream: (async function* () {
          yield "answer";
        })(),
      });

      await runChannelFlow({
        channel,
        userId: "user-1",
        conversationThreadId: "thread-1",
        userMessageId: "inbound-delete",
        userMessageText: "Dimentica la mia preferenza: mi alleno al mattino.",
        parts: [
          {
            type: "text",
            text: "Dimentica la mia preferenza: mi alleno al mattino.",
          },
        ],
        rateLimit: { allowed: true },
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: false,
        },
        ai: { isGuest: false },
        execution: { mode: "text" },
        persistence: { channel, saveAssistantMessage: false },
      });

      expect(mocks.resolveExactMemoryDeleteTarget).toHaveBeenCalledWith({
        userId: "user-1",
        userMessage: "Dimentica la mia preferenza: mi alleno al mattino.",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-delete",
      });
      expect(mocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedMemoryTarget: "training_schedule" }),
      );
    },
  );

  it("does not require effective entitlements to stream chat", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageText: "ciao",
      parts: [{ type: "text", text: "ciao" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveEntitlements: undefined,
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

  it("preserves multiple text parts while stripping files when attachments are disabled", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB_GUEST",
      userId: "guest-1",
      chatId: "chat-1",
      userMessageText: "caption\nextra context",
      parts: [
        { type: "text", text: "caption" },
        {
          type: "file",
          data: "image-base64",
          mimeType: "image/png",
          name: "photo.png",
        },
        { type: "text", text: "extra context" },
      ],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: false,
        allowMemoryExtraction: false,
        allowVoiceOutput: false,
      },
      ai: {
        hasImages: true,
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
        messageParts: [
          { type: "text", text: "caption" },
          { type: "text", text: "extra context" },
        ],
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

  it("passes an explicit voice-unavailability reason to the orchestrator", async () => {
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageText: "send me a voice note",
      parts: [{ type: "text", text: "send me a voice note" }],
      rateLimit: { allowed: true },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      ai: {
        responseMode: "text",
        voiceEnabled: false,
        voiceUnavailableReason:
          "Voice is temporarily unavailable, so I'm replying in text.",
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: "text",
        voiceEnabled: false,
        voiceUnavailableReason:
          "Voice is temporarily unavailable, so I'm replying in text.",
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
        userMessageId: `inbound-${testCase.name.replaceAll(" ", "-")}`,
        rateLimit: {
          allowed: true,
          effectiveEntitlements: {
            modelTier: "BASIC",
            uploadLimits: {
              maxUploadsPerDay: 25,
              maxUploadBytesPerDay: 250 * 1024 * 1024,
            },
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
          isGuest:
            testCase.input.channel === "WEB_GUEST" ||
            testCase.input.ai?.isGuest === true,
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

  it.each(["TELEGRAM", "WHATSAPP"] as const)(
    "does not extract memory for a guest %s turn before saving the assistant output",
    async (channel) => {
      mocks.streamChat.mockImplementation(async ({ onFinish }) => {
        await onFinish?.({
          text: "guest channel answer",
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
            yield "guest channel answer";
          })(),
        };
      });

      const result = await runChannelFlow({
        channel,
        userId: `guest-${channel.toLowerCase()}`,
        userMessageText: "guest channel turn",
        parts: [{ type: "text", text: "guest channel turn" }],
        rateLimit: { allowed: true },
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        ai: { isGuest: true },
        execution: { mode: "text" },
        persistence: { channel, saveAssistantMessage: true },
      });

      expect(result.persistence).toEqual({
        status: "saved",
        messageId: "assistant-1",
      });
      expect(mocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          isGuest: true,
          memoryEnabled: false,
        }),
      );
      expect(mocks.persistAssistantOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          channel,
          text: "guest channel answer",
          allowMemoryExtraction: false,
        }),
      );
      expect(mocks.getImmediatelyAttributableApproval).not.toHaveBeenCalled();
      expect(mocks.resolveExactMemoryDeleteTarget).not.toHaveBeenCalled();
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

  it("fails the channel flow when assistant output cannot be saved", async () => {
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

    await expect(
      runChannelFlow({
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
      }),
    ).rejects.toMatchObject({
      name: "AssistantPersistenceError",
      persistenceCause: persistenceError,
    });
  });

  it("aborts upstream and releases an unreconciled reservation once when the consumer disconnects", async () => {
    const sourceCancel = vi.fn();
    let upstreamSignal: AbortSignal | undefined;
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.streamChat.mockImplementation(async ({ abortSignal }) => {
      upstreamSignal = abortSignal;
      return {
        textStream: (async function* () {
          yield "partial answer";
        })(),
        toUIMessageStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: "start",
                messageId: "assistant-stream",
              });
              controller.enqueue({ type: "start-step" });
              controller.enqueue({ type: "text-start", id: "text-1" });
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "partial answer",
              });
            },
            cancel: sourceCancel,
          }),
      };
    });

    const requestAbort = new AbortController();
    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream", abortSignal: requestAbort.signal },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: false,
      },
    });

    const response = result.streamResult?.toUIMessageStreamResponse();
    const reader = response?.body?.getReader();
    const firstChunk = await reader?.read();
    const firstText = firstChunk?.value
      ? new TextDecoder().decode(firstChunk.value)
      : "";
    await reader?.cancel("client disconnected");

    expect(firstText).not.toContain('"type":"finish"');
    await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true));
    expect(sourceCancel).toHaveBeenCalledTimes(1);
    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1);
    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
    });
    expect(mocks.persistAssistantOutput).not.toHaveBeenCalled();
  });

  it("waits for the in-flight reservation release when the consumer disconnects", async () => {
    let completeRelease: ((released: boolean) => void) | undefined;
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.releaseAiUsageReservation.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          completeRelease = resolve;
        }),
    );
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "partial answer";
      })(),
      toUIMessageStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant" });
          },
        }),
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream" },
      persistence: { channel: "WEB", saveAssistantMessage: false },
    });

    const reader = result.streamResult
      ?.toUIMessageStreamResponse()
      .body?.getReader();
    await reader?.read();
    let cancellationFinished = false;
    const cancellation = reader?.cancel("client disconnected").then(() => {
      cancellationFinished = true;
    });

    await vi.waitFor(() =>
      expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1),
    );
    expect(cancellationFinished).toBe(false);
    completeRelease?.(true);
    await cancellation;

    expect(cancellationFinished).toBe(true);
    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1);
  });

  it("does not release a reservation while completed generation is settling", async () => {
    const sourceCancel = vi.fn();
    let resolvePersistence: ((message: { id: string }) => void) | undefined;
    let finishPromise: Promise<void> | undefined;
    let upstreamSignal: AbortSignal | undefined;
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.persistAssistantOutput.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolvePersistence = resolve;
        }),
    );
    mocks.streamChat.mockImplementation(async ({ abortSignal, onFinish }) => {
      upstreamSignal = abortSignal;
      return {
        textStream: (async function* () {
          yield "complete answer";
        })(),
        toUIMessageStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: "start",
                messageId: "assistant-stream",
              });
              finishPromise = onFinish?.({
                text: "complete answer",
                metrics: {
                  model: "test-model",
                  inputTokens: 3,
                  outputTokens: 2,
                  reasoningTokens: null,
                  reasoningContent: null,
                  toolCalls: null,
                  ragUsed: false,
                  ragChunksCount: 0,
                  costUsd: 0.01,
                  generationTimeMs: 100,
                  reasoningTimeMs: null,
                },
              });
            },
            cancel: sourceCancel,
          }),
      };
    });

    const requestAbort = new AbortController();
    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream", abortSignal: requestAbort.signal },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    const response = result.streamResult?.toUIMessageStreamResponse();
    const reader = response?.body?.getReader();
    await reader?.read();
    await vi.waitFor(() =>
      expect(mocks.persistAssistantOutput).toHaveBeenCalledTimes(1),
    );
    await reader?.cancel("client disconnected after generation");

    await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true));
    expect(sourceCancel).toHaveBeenCalledTimes(1);
    expect(mocks.releaseAiUsageReservation).not.toHaveBeenCalled();

    resolvePersistence?.({ id: "assistant-1" });
    await finishPromise;
    expect(mocks.releaseAiUsageReservation).not.toHaveBeenCalled();
  });

  it("releases an unreconciled reservation once when the source aborts after metrics", async () => {
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "partial answer",
        metrics: {
          model: "test-model",
          inputTokens: 3,
          outputTokens: 2,
          reasoningTokens: null,
          reasoningContent: null,
          toolCalls: null,
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 100,
          reasoningTimeMs: null,
        },
      });
      return {
        textStream: (async function* () {
          yield "partial answer";
        })(),
        toUIMessageStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "abort" });
              controller.close();
            },
          }),
      };
    });

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
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

    const response = result.streamResult?.toUIMessageStreamResponse();
    const body = await response?.text();

    expect(body).toContain('"type":"abort"');
    expect(body).not.toContain('"type":"finish"');
    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1);
  });

  it("releases the voice-first reservation once when a text-mode request aborts", async () => {
    const requestAbort = new AbortController();
    const abortError = new Error("request aborted");
    let streamStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });
    let upstreamSignal: AbortSignal | undefined;
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.streamChat.mockImplementation(async ({ abortSignal }) => {
      upstreamSignal = abortSignal;
      return {
        textStream: (async function* () {
          streamStarted?.();
          await new Promise<void>((resolve) => {
            if (abortSignal.aborted) {
              resolve();
              return;
            }
            abortSignal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          return;
        })(),
      };
    });

    const flowPromise = runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "text", abortSignal: requestAbort.signal },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: false,
      },
    });

    await started;
    requestAbort.abort(abortError);

    await expect(flowPromise).rejects.toBe(abortError);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1);
    expect(mocks.persistAssistantOutput).not.toHaveBeenCalled();
  });

  it("releases a text-mode reservation when generation ends without metrics", async () => {
    mocks.reserveAiUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "incomplete answer";
      })(),
    });

    await expect(
      runChannelFlow({
        channel: "WEB",
        userId: "user-1",
        chatId: "chat-1",
        userMessageId: "inbound-1",
        userMessageText: "hello",
        parts: [{ type: "text", text: "hello" }],
        rateLimit: {
          allowed: true,
          effectiveEntitlements: {
            modelTier: "BASIC",
            uploadLimits: {
              maxUploadsPerDay: 25,
              maxUploadBytesPerDay: 250 * 1024 * 1024,
            },
            limits: {
              maxRequestsPerDay: 10,
              maxInputTokensPerDay: 1_000,
              maxOutputTokensPerDay: 1_000,
              maxCostPerDay: 1,
              maxContextMessages: 20,
            },
            sources: [],
          },
        },
        options: {
          allowAttachments: true,
          allowMemoryExtraction: true,
          allowVoiceOutput: true,
        },
        execution: { mode: "text" },
        persistence: {
          channel: "WEB",
          saveAssistantMessage: false,
        },
      }),
    ).rejects.toThrow("AI generation completed without final metrics");

    expect(mocks.releaseAiUsageReservation).toHaveBeenCalledTimes(1);
  });

  it("turns streamed persistence rejection into an error without a successful finish", async () => {
    const persistenceError = new Error("database is unavailable");
    const reservation = {
      allowed: true as const,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    };

    mocks.reserveAiUsage.mockResolvedValue(reservation);
    mocks.persistAssistantOutput.mockRejectedValue(persistenceError);
    mocks.streamChat.mockImplementation(async ({ onFinish }) => ({
      textStream: (async function* () {
        yield "unsaved answer";
      })(),
      toUIMessageStream: (options: {
        sendFinish?: boolean;
        sendReasoning?: boolean;
      }) => {
        expect(options).toEqual({
          sendFinish: false,
          sendReasoning: false,
        });
        return new ReadableStream({
          async start(controller) {
            controller.enqueue({
              type: "start",
              messageId: "assistant-stream",
            });
            controller.enqueue({ type: "start-step" });
            controller.enqueue({ type: "text-start", id: "text-1" });
            controller.enqueue({
              type: "text-delta",
              id: "text-1",
              delta: "unsaved answer",
            });
            controller.enqueue({ type: "text-end", id: "text-1" });
            try {
              await onFinish?.({
                text: "unsaved answer",
                metrics: {
                  model: "test-model",
                  inputTokens: 3,
                  outputTokens: 2,
                  reasoningTokens: null,
                  reasoningContent: null,
                  toolCalls: null,
                  ragUsed: false,
                  ragChunksCount: 0,
                  costUsd: 0.01,
                  generationTimeMs: 100,
                  reasoningTimeMs: null,
                },
              });
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        });
      },
    }));

    const result = await runChannelFlow({
      channel: "WEB",
      userId: "user-1",
      chatId: "chat-1",
      userMessageId: "inbound-1",
      userMessageText: "hello",
      parts: [{ type: "text", text: "hello" }],
      rateLimit: {
        allowed: true,
        effectiveEntitlements: {
          modelTier: "BASIC",
          uploadLimits: {
            maxUploadsPerDay: 25,
            maxUploadBytesPerDay: 250 * 1024 * 1024,
          },
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1_000,
            maxOutputTokensPerDay: 1_000,
            maxCostPerDay: 1,
            maxContextMessages: 20,
          },
          sources: [],
        },
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
      },
    });

    const response = result.streamResult?.toUIMessageStreamResponse();
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain(
      "Non sono riuscito a salvare la risposta. Riprova senza perdere quota.",
    );
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"finish"');
    expect(mocks.reconcileAiUsageForRecovery).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
      text: "unsaved answer",
      metrics: expect.objectContaining({ inputTokens: 3, outputTokens: 2 }),
    });
    expect(mocks.releaseAiUsageReservation).not.toHaveBeenCalled();
  });
});
