import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdate: vi.fn(),
  messageMetricsCreate: vi.fn(),
  messageMetricsUpdate: vi.fn(),
  voiceGenerationJobCreate: vi.fn(),
  chatUpdate: vi.fn(),
  incrementUsage: vi.fn(),
  consolidateTurnMemory: vi.fn(),
  indexConversationWindow: vi.fn(),
  markMemoryApprovalPresented: vi.fn(),
  captureAiTurnTrace: vi.fn(),
  revalidateTag: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: {
      create: mocks.messageCreate,
      findUnique: mocks.messageFindUnique,
      update: mocks.messageUpdate,
    },
    messageMetrics: {
      create: mocks.messageMetricsCreate,
      update: mocks.messageMetricsUpdate,
    },
    chat: {
      update: mocks.chatUpdate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  incrementUsage: mocks.incrementUsage,
}));

vi.mock("@/lib/ai/memory-consolidator", () => ({
  consolidateTurnMemory: mocks.consolidateTurnMemory,
}));
vi.mock("@/lib/ai/conversation-index", () => ({
  indexConversationWindow: mocks.indexConversationWindow,
}));
vi.mock("@/lib/ai/memory-approval", () => ({
  markMemoryApprovalPresented: mocks.markMemoryApprovalPresented,
}));

vi.mock("@/lib/ai/trace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/trace")>()),
  captureAiTurnTrace: mocks.captureAiTurnTrace,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

import type { ExecutionRouteTrace } from "@/lib/ai/execution-route-trace";
import { createServerTraceCollector } from "@/lib/response-profiler/server-trace";
import {
  markVoiceCapabilityDelivered,
  persistAssistantOutput,
} from "./persistence";

function escalatedExecutionRoute(): ExecutionRouteTrace {
  return {
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
    reasonCodes: ["classifier_light", "task_allowlisted"],
    classificationLatencyMs: 14,
    routingOverheadMs: 3,
    totalRequestTimeToFirstTokenMs: 210,
    attempts: [
      {
        sequence: 1,
        profile: "light",
        outcome: "failed_before_stream",
        generationTimeMs: 40,
        inputTokens: 10,
        costUsd: 0.001,
      },
      {
        sequence: 2,
        profile: "standard",
        outcome: "completed",
        timeToFirstTokenMs: 150,
        generationTimeMs: 300,
        inputTokens: 30,
        outputTokens: 20,
        reasoningTokens: 4,
        costUsd: 0.006,
      },
    ],
    escalation: {
      from: "light",
      to: "standard",
      reason: "empty_response",
    },
  };
}

describe("channel-flow/persistence", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.transaction.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageFindUnique.mockReset();
    mocks.messageUpdate.mockReset();
    mocks.messageMetricsCreate.mockReset();
    mocks.messageMetricsUpdate.mockReset();
    mocks.voiceGenerationJobCreate.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.consolidateTurnMemory.mockReset();
    mocks.indexConversationWindow.mockReset();
    mocks.markMemoryApprovalPresented.mockReset();
    mocks.captureAiTurnTrace.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.loggerError.mockReset();

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        message: {
          create: mocks.messageCreate,
          findUnique: mocks.messageFindUnique,
          update: mocks.messageUpdate,
        },
        messageMetrics: { create: mocks.messageMetricsCreate },
        voiceGenerationJob: { create: mocks.voiceGenerationJobCreate },
      }),
    );
    mocks.messageCreate.mockResolvedValue({ id: "msg-1" });
    mocks.messageUpdate.mockResolvedValue({ id: "msg-1" });
    mocks.messageMetricsCreate.mockResolvedValue({ id: "metrics-1" });
    mocks.messageMetricsUpdate.mockResolvedValue({ id: "metrics-1" });
    mocks.voiceGenerationJobCreate.mockResolvedValue({ id: "voice-job-1" });
    mocks.chatUpdate.mockResolvedValue({});
    mocks.incrementUsage.mockResolvedValue({});
    mocks.consolidateTurnMemory.mockResolvedValue({
      considered: 0,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 0,
    });
    mocks.indexConversationWindow.mockResolvedValue({
      status: "indexed",
      chunkId: "chunk-1",
    });
    mocks.markMemoryApprovalPresented.mockResolvedValue({
      status: "presented",
    });
    mocks.captureAiTurnTrace.mockResolvedValue({ id: "trace-1" });
  });

  it("marks voice only at delivery and replaces capability payloads atomically", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      metadata: {
        voice: { status: "processing" },
        ai: { capabilitiesUsed: ["memory"], toolCallCount: 1 },
      },
      parts: [
        { type: "text", text: "assistant" },
        {
          type: "data-aiCapabilities",
          data: {
            capabilities: ["memory"],
            providerMetadata: { requestId: "SECRET_PROVIDER_PAYLOAD" },
          },
        },
        {
          type: "data-aiCapabilities",
          data: { capabilities: ["unknown", "rag"] },
        },
      ],
    });

    await markVoiceCapabilityDelivered("msg-1");

    expect(mocks.messageFindUnique).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      select: { metadata: true, parts: true },
    });
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: {
        type: "AUDIO",
        mediaType: "audio/mpeg",
        metadata: {
          voice: { status: "processing" },
          ai: {
            capabilitiesUsed: ["rag", "memory", "voice"],
            toolCallCount: 1,
          },
        },
        parts: [
          { type: "text", text: "assistant" },
          {
            type: "data-aiCapabilities",
            data: { capabilities: ["rag", "memory", "voice"] },
          },
        ],
      },
    });
    expect(
      JSON.stringify(mocks.messageUpdate.mock.calls[0]?.[0]),
    ).not.toContain("SECRET_PROVIDER_PAYLOAD");
  });

  it("persists assistant message and post-process steps", async () => {
    const scheduled: Promise<unknown>[] = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduled.push(promise);
    });

    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 1,
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
    expect(mocks.consolidateTurnMemory).toHaveBeenCalledWith({
      userId: "user-1",
      inboundMessageId: "inbound-1",
      userText: "hello",
      assistantText: "assistant",
    });
    expect(waitUntil).toHaveBeenCalledTimes(2);
    await Promise.all(scheduled);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("does not block assistant persistence on chat freshness and tag work", async () => {
    const scheduled: Promise<unknown>[] = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduled.push(promise);
    });
    let resolveChatUpdate: (() => void) | undefined;
    mocks.chatUpdate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveChatUpdate = resolve;
        }),
    );

    const persistence = persistAssistantOutput({
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
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: 22,
      },
      updateChatTimestamp: true,
      revalidateTags: ["chat-user-1", "chat-1"],
      waitUntil,
    });

    await vi.waitFor(() => {
      expect(waitUntil).toHaveBeenCalledTimes(1);
    });
    await expect(persistence).resolves.toMatchObject({ id: "msg-1" });

    resolveChatUpdate?.();
    await Promise.all(scheduled);

    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("schedules consolidation for an agentic turn with no memory tool call", async () => {
    const waitUntil = vi.fn();

    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-agentic",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "I train on Tuesday and Thursday.",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: null,
      },
      allowMemoryExtraction: true,
      capabilityPlannerMode: "agentic",
      waitUntil,
    });

    expect(mocks.consolidateTurnMemory).toHaveBeenCalledWith({
      userId: "user-1",
      inboundMessageId: "inbound-agentic",
      userText: "I train on Tuesday and Thursday.",
      assistantText: "assistant",
    });
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });

  it("schedules conversation indexing after a linked turn is persisted", async () => {
    const waitUntil = vi.fn();

    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-index",
      conversationThreadId: "thread-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "ricordi la finale?",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
      waitUntil,
    });

    expect(mocks.indexConversationWindow).toHaveBeenCalledWith({
      userId: "user-1",
      conversationThreadId: "thread-1",
      throughMessageId: "msg-1",
    });
    expect(waitUntil).toHaveBeenCalledTimes(3);
  });

  it("links a forced sensitive-memory presentation to the persisted assistant", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-presentation",
      conversationThreadId: "thread-1",
      channel: "WEB",
      text: "Vuoi che tenga a mente questa informazione?",
      userMessageText: "Continuiamo.",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.002,
        generationTimeMs: 50,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: true,
      presentedMemoryApprovalId: "approval-1",
    });

    expect(mocks.markMemoryApprovalPresented).toHaveBeenCalledWith({
      userId: "user-1",
      approvalId: "approval-1",
      presentationInboundMessageId: "inbound-presentation",
      presentationAssistantMessageId: "msg-1",
    });
  });

  it("does not infer planner mode from process state during persistence", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");

    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-legacy",
      channel: "WEB",
      text: "assistant",
      userMessageText: "I train on Tuesday and Thursday.",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: null,
      },
      allowMemoryExtraction: true,
    });

    expect(mocks.consolidateTurnMemory).toHaveBeenCalledTimes(1);
  });

  it("persists only completed capabilities allowed by the immutable agentic decision", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "TELEGRAM",
      text: "assistant",
      userMessageText: "latest result",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [
          { name: "tinyfishSearch", status: "completed" },
          { name: "saveMemory", status: "completed" },
        ],
        capabilitiesUsed: ["web", "memory"],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: null,
      },
      capabilityDecision: Object.freeze({
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
        source: "classifier",
        reasonCodes: [],
      }),
      capabilityPlannerMode: "agentic",
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parts: [
            { type: "text", text: "assistant" },
            {
              type: "data-aiCapabilities",
              data: { capabilities: ["web"] },
            },
          ],
          metadata: {
            ai: { capabilitiesUsed: ["web"] },
          },
        }),
      }),
    );
  });

  it("persists only safe aggregate tool metadata", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: null,
        toolCalls: [
          {
            name: "saveMemory",
            args: {
              key: "health_condition",
              value: "Diagnosi privata",
              category: "health",
            },
            result: { status: "approval_required", approvalId: "approval-1" },
          },
        ],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: null,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolCalls: [{ name: "saveMemory", status: "completed" }],
        }),
      }),
    );
  });

  it("persists only completed pre-delivery capabilities without raw payloads", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        provider: "private-provider",
        providerMetadata: { host: "private-provider.example" },
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: null,
        reasoningContent: "private reasoning",
        toolCalls: [
          {
            name: "saveMemory",
            args: {
              key: "private-key",
              value: "private-value",
              category: "private-category",
            },
            result: { documentId: "private-document-id" },
          },
        ],
        ragAttempted: false,
        ragUsed: false,
        ragChunksCount: 0,
        capabilitiesUsed: ["memory", "voice"],
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: null,
      } as never,
      allowMemoryExtraction: false,
    });

    const parts = mocks.messageCreate.mock.calls[0]?.[0].data.parts;
    expect(parts).toEqual([
      { type: "text", text: "assistant" },
      {
        type: "data-aiCapabilities",
        data: { capabilities: ["memory"] },
      },
    ]);
    const persistedMessage = mocks.messageCreate.mock.calls[0]?.[0].data;
    expect(JSON.stringify(persistedMessage)).not.toContain("private");
    expect(persistedMessage).not.toHaveProperty("reasoningContent");
  });

  it("omits the capability part when no capability completed", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: null,
        toolCalls: [],
        ragAttempted: true,
        ragUsed: false,
        ragChunksCount: 0,
        capabilitiesUsed: [],
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: null,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parts: [{ type: "text", text: "assistant" }],
        }),
      }),
    );
  });

  it("discards historical route metadata from current persistence", async () => {
    const executionRoute = escalatedExecutionRoute();
    const waitUntil = vi.fn();

    await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-route",
      conversationThreadId: "thread-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "Riscrivi questo testo.",
      metrics: {
        model: "test-model",
        inputTokens: 40,
        outputTokens: 20,
        reasoningTokens: 4,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.007,
        generationTimeMs: 300,
        reasoningTimeMs: 20,
        executionRoute,
        turnPlan: { execution: { profile: "light" } },
        tracePayload: { toolCalls: [] },
      },
      metadata: { source: "test" },
      waitUntil,
    });

    const metricsData = mocks.messageMetricsCreate.mock.calls[0]?.[0].data;
    expect(metricsData).not.toHaveProperty("executionRoute");
    const messageData = mocks.messageCreate.mock.calls[0]?.[0].data;
    expect(JSON.stringify(messageData)).not.toContain("executionRouting");
    expect(mocks.captureAiTurnTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          executionRouting: expect.anything(),
        }),
        payload: expect.not.objectContaining({
          executionRoute: expect.anything(),
        }),
      }),
    );
  });

  it("removes exact memory targets and tool payloads from trace metadata", async () => {
    const waitUntil = vi.fn();

    await persistAssistantOutput({
      userId: "user-1",
      conversationThreadId: "thread-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "Dimentica il mio orario di allenamento.",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: null,
        toolCalls: [{ name: "deleteMemory", status: "completed" }],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0,
        generationTimeMs: 1,
        reasoningTimeMs: null,
        turnPlan: {
          capabilities: { memoryDelete: true },
          memoryDeleteTarget: "training_schedule",
        },
        tracePayload: {
          turnDecision: {
            version: 1,
            capabilities: {
              rag: false,
              webSearch: false,
              webFetch: false,
              memoryRead: false,
              memoryWrite: false,
              memoryDelete: true,
              memoryDeleteTarget: "training_schedule",
              routineProposal: false,
              userContext: false,
              voiceOutput: false,
              source: "mixed",
              reasonCodes: ["delete_requires_exact_target"],
              rawClassifierOutput: "private classifier output",
            },
            execution: {
              eligibleProfile: "standard",
              taskKind: "coaching",
              contextDependency: "deep",
              source: "mixed",
              confidenceBucket: "high",
              reasonCodes: ["capability_required", "deep_context"],
              policyVersion: 1,
              classifierVersion: 1,
              classifierProse: "private classifier prose",
            },
          },
          toolCalls: [
            {
              name: "deleteMemory",
              args: { key: "training_schedule" },
              result: { memoryId: "memory-1" },
            },
          ],
        },
      },
      allowMemoryExtraction: false,
      waitUntil,
    });

    expect(mocks.captureAiTurnTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          turnPlan: {
            capabilities: { memoryDelete: true },
          },
        }),
        payload: expect.objectContaining({
          toolCalls: [{ name: "deleteMemory", status: "completed" }],
        }),
      }),
    );
    expect(
      JSON.stringify(mocks.captureAiTurnTrace.mock.calls[0]),
    ).not.toContain("training_schedule");
    expect(
      JSON.stringify(mocks.captureAiTurnTrace.mock.calls[0]),
    ).not.toContain("memory-1");
    expect(
      JSON.stringify(mocks.captureAiTurnTrace.mock.calls[0]),
    ).not.toContain("private classifier output");
    expect(
      JSON.stringify(mocks.captureAiTurnTrace.mock.calls[0]),
    ).not.toContain("private classifier prose");
  });

  it("persists a validated routine proposal after the assistant text", async () => {
    const proposal = {
      formatVersion: 2,
      title: "Reset pre-gara",
      trigger: "Quando sento salire la pressione prima della partita",
      durationLabel: "2 minuti",
      steps: [
        {
          id: "breath-reset",
          kind: "breathing",
          label: "Respiro",
          instruction: "Segui un respiro lento e regolare.",
          inhaleSeconds: 3,
          exhaleSeconds: 5,
          holdAfterInhaleSeconds: 0,
          holdAfterExhaleSeconds: 0,
          cycles: 3,
        },
        {
          id: "focus-timer",
          kind: "timer",
          label: "Focus",
          instruction: "Ripeti la parola chiave e guarda il primo gesto.",
          durationSeconds: 30,
        },
        {
          id: "first-gesture",
          kind: "instruction",
          text: "Scegli il primo gesto semplice e riparti da lì.",
        },
        {
          id: "completion",
          kind: "form",
          question: "Quanto ti è stata utile questa routine?",
          mode: "choice",
          options: [
            { label: "Molto", outcome: "HELPFUL" },
            { label: "In parte", outcome: "PARTIALLY_HELPFUL" },
            { label: "Per nulla", outcome: "NOT_HELPFUL" },
          ],
          noteEnabled: true,
        },
      ],
      completionCue: "Inizio il primo punto con presenza.",
    };

    await persistAssistantOutput({
      userId: "user-1",
      chatId: "chat-1",
      channel: "WEB",
      text: "Prova questa routine.",
      userMessageText: "Sono in ansia per la partita",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [
          {
            name: "proposeRoutine",
            args: proposal,
            result: { proposal },
          },
        ],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: 22,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parts: [
            { type: "text", text: "Prova questa routine." },
            { type: "data-coachingRoutine", data: proposal },
          ],
        }),
      }),
    );
  });

  it("does not turn a malformed v2 proposal into a routine card", async () => {
    await persistAssistantOutput({
      userId: "user-1",
      channel: "WEB",
      text: "Prova questa routine.",
      userMessageText: "Sono in ansia per la partita",
      metrics: {
        model: "test-model",
        inputTokens: 5,
        outputTokens: 8,
        reasoningTokens: 0,
        toolCalls: [
          {
            name: "proposeRoutine",
            args: {
              formatVersion: 2,
              title: "Reset pre-gara",
              trigger: "Quando sento salire la pressione prima della partita",
              steps: [
                {
                  id: "completion-too-early",
                  kind: "form",
                  question: "Quanto ti è stata utile questa routine?",
                  mode: "choice",
                  options: [
                    { label: "Molto", outcome: "HELPFUL" },
                    { label: "In parte", outcome: "PARTIALLY_HELPFUL" },
                    { label: "Per nulla", outcome: "NOT_HELPFUL" },
                  ],
                  noteEnabled: false,
                },
                {
                  id: "after-form",
                  kind: "instruction",
                  text: "Riparti dal primo gesto semplice.",
                },
              ],
              completionCue: "Inizio il primo punto con presenza.",
            },
          },
        ],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.02,
        generationTimeMs: 111,
        reasoningTimeMs: 22,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parts: [{ type: "text", text: "Prova questa routine." }],
        }),
      }),
    );
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

  it("persists normalized scalar metrics without raw provider or reasoning data", async () => {
    vi.stubEnv("NODE_ENV", "production");
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
        developerDiagnostics: {
          version: 1,
          tools: [],
          truncated: false,
        },
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
        developerDiagnostics: {
          version: 1,
          tools: [],
          truncated: false,
        },
      },
    });
    const persistedMetrics = mocks.messageMetricsCreate.mock.calls[0]?.[0].data;
    expect(persistedMetrics).not.toHaveProperty("providerMetadata");
    expect(persistedMetrics).not.toHaveProperty("reasoningContent");
    expect(JSON.stringify(persistedMetrics)).not.toContain("private reasoning");
  });

  it("stores a partial trace atomically and finalizes persistence timing", async () => {
    let clock = 0;
    const traceCollector = createServerTraceCollector({ now: () => clock });
    const auth = traceCollector.startSpan("auth");
    clock = 10;
    auth.end();
    mocks.messageCreate.mockImplementation(async () => {
      clock = 20;
      return { id: "msg-profiled" };
    });
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback({
        message: {
          create: mocks.messageCreate,
          findUnique: mocks.messageFindUnique,
          update: mocks.messageUpdate,
        },
        messageMetrics: { create: mocks.messageMetricsCreate },
        voiceGenerationJob: { create: mocks.voiceGenerationJobCreate },
      });
      clock = 40;
      return result;
    });

    await persistAssistantOutput({
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
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 30,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
      traceCollector,
    });

    expect(mocks.messageMetricsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: "msg-profiled",
        serverTrace: {
          version: 1,
          status: "partial",
          totalMs: 20,
          spans: [
            expect.objectContaining({
              name: "auth",
              durationMs: 10,
            }),
          ],
        },
      }),
    });
    expect(mocks.messageMetricsUpdate).toHaveBeenCalledWith({
      where: { messageId: "msg-profiled" },
      data: {
        serverTrace: {
          version: 1,
          status: "completed",
          totalMs: 40,
          spans: [
            expect.objectContaining({ name: "auth", durationMs: 10 }),
            expect.objectContaining({
              name: "assistant_persistence",
              startOffsetMs: 10,
              durationMs: 30,
              status: "completed",
            }),
          ],
        },
      },
    });
  });

  it("keeps a successful assistant response when trace finalization fails", async () => {
    const traceCollector = createServerTraceCollector({ now: () => 10 });
    mocks.messageCreate.mockResolvedValue({ id: "msg-created" });
    mocks.messageMetricsUpdate.mockRejectedValue(
      new Error("trace write failed"),
    );

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
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
      traceCollector,
    });

    expect(result).toEqual({ id: "msg-created" });
    await vi.waitFor(() =>
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        "profiler.server_trace_finalize_failed",
        "Failed finalizing server response trace",
        { messageId: "msg-created", errorName: "Error" },
      ),
    );
  });

  it("does not delay the assistant result while server trace finalization is pending", async () => {
    const traceCollector = createServerTraceCollector({ now: () => 10 });
    let resolveFinalization: (() => void) | undefined;
    mocks.messageMetricsUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveFinalization = () => resolve({ id: "metrics-1" });
      }),
    );

    const resultPromise = persistAssistantOutput({
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
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
      traceCollector,
    });

    await vi.waitFor(() =>
      expect(mocks.messageMetricsUpdate).toHaveBeenCalledOnce(),
    );
    const resolvedWithoutFinalization = await Promise.race([
      resultPromise.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 0)),
    ]);

    expect(resolvedWithoutFinalization).toBe(true);
    resolveFinalization?.();
    await resultPromise;
  });

  it("closes assistant persistence as failed when the primary transaction rejects", async () => {
    let clock = 0;
    const traceCollector = createServerTraceCollector({ now: () => clock });
    const persistenceError = new Error("primary persistence failed");
    mocks.transaction.mockImplementation(async () => {
      clock = 25;
      throw persistenceError;
    });

    await expect(
      persistAssistantOutput({
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
          toolCalls: [],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.001,
          generationTimeMs: 10,
          reasoningTimeMs: 0,
        },
        allowMemoryExtraction: false,
        traceCollector,
      }),
    ).rejects.toBe(persistenceError);

    expect(traceCollector.snapshot("partial").spans).toEqual([
      expect.objectContaining({
        name: "assistant_persistence",
        durationMs: 25,
        status: "failed",
      }),
    ]);
  });

  it("does not overwrite trace data when an inbound response is reused", async () => {
    const traceCollector = createServerTraceCollector({ now: () => 10 });
    mocks.messageFindUnique.mockResolvedValue({
      id: "msg-existing",
      userId: "user-1",
    });

    const result = await persistAssistantOutput({
      userId: "user-1",
      userMessageId: "inbound-existing",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 0,
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
      traceCollector,
    });

    expect(result).toEqual({ id: "msg-existing", userId: "user-1" });
    expect(mocks.messageMetricsCreate).not.toHaveBeenCalled();
    expect(mocks.messageMetricsUpdate).not.toHaveBeenCalled();
  });

  it("preserves metrics persistence behavior when no collector is provided", async () => {
    await persistAssistantOutput({
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
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.001,
        generationTimeMs: 10,
        reasoningTimeMs: 0,
      },
      allowMemoryExtraction: false,
    });

    expect(mocks.messageMetricsCreate).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ serverTrace: expect.anything() }),
    });
    expect(mocks.messageMetricsUpdate).not.toHaveBeenCalled();
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
      } as never,
      allowMemoryExtraction: false,
    });

    expect(mocks.messageMetricsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "Nebius" }),
      }),
    );
    expect(
      mocks.messageMetricsCreate.mock.calls[0]?.[0].data,
    ).not.toHaveProperty("providerMetadata");
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
    expect(mocks.consolidateTurnMemory).not.toHaveBeenCalled();
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
      userMessageId: "inbound-usage-failure",
      chatId: "chat-1",
      channel: "WEB",
      text: "assistant",
      userMessageText: "hello",
      metrics: {
        model: "test-model",
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 0,
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
    expect(mocks.consolidateTurnMemory).toHaveBeenCalledTimes(1);
  });
});
