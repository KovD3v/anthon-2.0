import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  arbitrateTurn: vi.fn(),
  buildConversationContext: vi.fn(),
  buildThreadContext: vi.fn(),
  buildRecallContext: vi.fn(),
  getRagContext: vi.fn(),
  resolveMemoryRecallMode: vi.fn(),
  getModelForUser: vi.fn(),
  getModelById: vi.fn(),
  getModelIdForPlan: vi.fn(),
  getOpenRouterProviderOptionsForModel: vi.fn(),
  streamText: vi.fn(),
  extractAIMetrics: vi.fn(),
  createMemoryTools: vi.fn(),
  createRagTools: vi.fn(),
  createTinyfishTools: vi.fn(),
  createUserContextTools: vi.fn(),
  createConversationRecallTools: vi.fn(),
  createRoutineProposalTool: vi.fn(),
  formatMemoriesForPrompt: vi.fn(),
  formatUserContextForPrompt: vi.fn(),
  getVoicePlanConfig: vi.fn(),
  captureAiGenerationMetadata: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperation: vi.fn().mockResolvedValue(undefined),
  recordAiOperationFailure: vi.fn().mockResolvedValue(undefined),
  scheduleCostAttribution: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  isStepCount: vi.fn(() => "stop"),
  streamText: mocks.streamText,
}));

vi.mock("@/lib/ai/turn-arbitration", () => ({
  arbitrateTurn: mocks.arbitrateTurn,
}));

vi.mock("@/lib/ai/recall-context", () => ({
  buildRecallContext: mocks.buildRecallContext,
}));

vi.mock("@/lib/ai/rag", () => ({
  getRagContext: mocks.getRagContext,
  shouldUseRag: vi.fn(() => false),
}));

vi.mock("@/lib/ai/memory-recall-release", () => ({
  resolveMemoryRecallMode: mocks.resolveMemoryRecallMode,
}));

vi.mock("@/lib/ai/session-manager", () => ({
  buildConversationContext: mocks.buildConversationContext,
}));

vi.mock("@/lib/ai/thread-context", () => ({
  buildThreadContext: mocks.buildThreadContext,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  getModelForUser: mocks.getModelForUser,
  getModelById: mocks.getModelById,
  getModelIdForPlan: mocks.getModelIdForPlan,
}));

vi.mock("@/lib/ai/providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel:
    mocks.getOpenRouterProviderOptionsForModel,
}));

vi.mock("@/lib/ai/cost-calculator", () => ({
  extractAIMetrics: mocks.extractAIMetrics,
}));

vi.mock("@/lib/ai/telemetry", () => ({
  captureAiGenerationMetadata: mocks.captureAiGenerationMetadata,
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  createMemoryTools: mocks.createMemoryTools,
  formatMemoriesForPrompt: mocks.formatMemoriesForPrompt,
}));

vi.mock("@/lib/ai/tools/rag", () => ({
  createRagTools: mocks.createRagTools,
}));

vi.mock("@/lib/ai/tools/tinyfish", () => ({
  createTinyfishTools: mocks.createTinyfishTools,
}));

vi.mock("@/lib/ai/tools/user-context", () => ({
  createUserContextTools: mocks.createUserContextTools,
  formatUserContextForPrompt: mocks.formatUserContextForPrompt,
}));

vi.mock("@/lib/ai/tools/conversation-recall", () => ({
  createConversationRecallTools: mocks.createConversationRecallTools,
}));

vi.mock("@/lib/ai/tools/routine-proposal", () => ({
  createRoutineProposalTool: mocks.createRoutineProposalTool,
}));

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  }),
}));

import {
  recordAiOperation,
  recordAiOperationFailure,
} from "./cost-attribution";
import {
  executePreparedChatTurn,
  prepareChatTurn,
  streamChat,
} from "./orchestrator";

const entitlements = {
  plan: "BASIC" as const,
  limits: {
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 10_000,
    maxOutputTokensPerDay: 8_000,
    maxCostPerDay: 10,
    maxContextMessages: 20,
  },
  uploadLimits: {
    maxUploadsPerDay: 25,
    maxUploadBytesPerDay: 250 * 1024 * 1024,
  },
  modelTier: "BASIC" as const,
  sources: [],
};

const decision = {
  version: 1 as const,
  capabilities: {
    rag: false,
    webSearch: false,
    webFetch: false,
    memoryRead: false,
    memoryWrite: false,
    memoryDelete: false,
    memoryDeleteTarget: null,
    routineProposal: false,
    userContext: false,
    voiceOutput: false,
    source: "rule" as const,
    reasonCodes: ["deterministic_policy"],
  },
};

function emptyTextStream() {
  return (async function* () {
    yield "answer";
  })();
}

describe("ai/orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.arbitrateTurn.mockResolvedValue({ decision });
    mocks.buildConversationContext.mockResolvedValue([]);
    mocks.buildThreadContext.mockResolvedValue({ messages: [] });
    mocks.getRagContext.mockResolvedValue({
      text: "Curated knowledge",
      chunkCount: 1,
    });
    mocks.buildRecallContext.mockResolvedValue({
      prompt: "",
      factCount: 0,
      evidenceCount: 0,
      factRecallMs: 0,
      conversationRecallMs: 0,
      degraded: false,
      allowedEvidenceIds: new Set<string>(),
    });
    mocks.resolveMemoryRecallMode.mockResolvedValue({
      mode: "off",
      reason: "disabled",
    });
    mocks.getModelForUser.mockReturnValue("model");
    mocks.getModelById.mockReturnValue("model");
    mocks.getModelIdForPlan.mockReturnValue("provider/model");
    mocks.getOpenRouterProviderOptionsForModel.mockReturnValue({
      provider: { sort: "latency" },
    });
    mocks.extractAIMetrics.mockResolvedValue({
      model: "provider/model",
      provider: "openrouter",
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: [],
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0,
      generationTimeMs: 1,
      reasoningTimeMs: null,
    });
    mocks.createMemoryTools.mockReturnValue({});
    mocks.createRagTools.mockReturnValue({ searchRag: {} });
    mocks.createTinyfishTools.mockReturnValue({
      tinyfishSearch: {},
      tinyfishFetch: {},
    });
    mocks.createUserContextTools.mockReturnValue({ getUserContext: {} });
    mocks.createConversationRecallTools.mockReturnValue({});
    mocks.createRoutineProposalTool.mockReturnValue({ proposeRoutine: {} });
    mocks.formatMemoriesForPrompt.mockResolvedValue("");
    mocks.formatUserContextForPrompt.mockResolvedValue("");
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: false });
    mocks.streamText.mockReturnValue({ textStream: emptyTextStream() });
  });

  it("prepares one full capability plan without a classifier or profile metadata", async () => {
    const prepared = await prepareChatTurn({
      userId: "user-1",
      chatId: "chat-1",
      conversationThreadId: "thread-1",
      userMessageId: "message-1",
      userMessage: "Aiutami a capire cosa mi blocca",
      effectiveEntitlements: entitlements,
    });

    expect(mocks.arbitrateTurn).toHaveBeenCalledOnce();
    expect(prepared.promptMode).toBe("full");
    expect(prepared.capabilityPlannerMode).toBe("agentic");
    expect(prepared.turnPlan.promptProfile).toBe("full");
    expect(prepared.turnDecision).toMatchObject({
      version: 1,
      capabilities: { source: "rule" },
    });
    expect(prepared.turnDecision).not.toHaveProperty("execution");
    expect(prepared).not.toHaveProperty("classificationLatencyMs");
    expect(prepared).not.toHaveProperty("plannedExecution");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.turnDecision)).toBe(true);
    expect(Object.isFrozen(prepared.turnPlan)).toBe(true);
  });

  it("lets the single model path see authorized tools without a live classifier", async () => {
    const result = await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "Aiutami a capire cosa mi blocca",
      effectiveEntitlements: entitlements,
    });

    expect(mocks.arbitrateTurn).toHaveBeenCalledOnce();
    const streamInput = mocks.streamText.mock.calls.at(-1)?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.instructions).toContain("AGENTIC TOOL SELECTION");
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        searchRag: expect.anything(),
        tinyfishSearch: expect.anything(),
        tinyfishFetch: expect.anything(),
        getUserContext: expect.anything(),
      }),
    );
    expect(result.turnPlan.promptProfile).toBe("full");
    expect(result.turnDecision).not.toHaveProperty("execution");
    expect(result).not.toHaveProperty("classificationLatencyMs");
    expect(result).not.toHaveProperty("executionRoute");
  });

  it("does not add tools to a prepared model-comparison generation", async () => {
    mocks.arbitrateTurn.mockResolvedValue({
      decision: {
        ...decision,
        capabilities: { ...decision.capabilities, rag: true },
      },
    });
    const prepared = await prepareChatTurn({
      userId: "user-1",
      chatId: "chat-1",
      conversationThreadId: "thread-1",
      userMessageId: "message-1",
      userMessage: "Aiutami a concentrarmi",
      effectiveEntitlements: entitlements,
    });

    executePreparedChatTurn({
      prepared,
      modelId: "provider/model",
      generationConfig: { fallbacks: false },
      clerkId: "clerk-1",
      traceId: "trace-1",
      experimentId: "experiment-1",
      pairId: "pair-1",
      role: "CONTROL",
    });

    const streamInput = mocks.streamText.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(streamInput).not.toHaveProperty("tools");
    expect(streamInput.instructions).toContain("MENTAL COACHING SCOPE");
    executePreparedChatTurn({
      prepared,
      modelId: "provider/challenger",
      generationConfig: { fallbacks: false },
      clerkId: "clerk-1",
      traceId: "trace-2",
      experimentId: "experiment-1",
      pairId: "pair-1",
      role: "CANDIDATE",
    });
    expect(mocks.buildRecallContext).toHaveBeenCalledTimes(1);
    expect(mocks.getRagContext).toHaveBeenCalledTimes(1);
    expect(mocks.getRagContext).toHaveBeenCalledWith(
      "Aiutami a concentrarmi",
      undefined,
      expect.objectContaining({
        userId: "user-1",
        recentMessages: expect.any(Promise),
      }),
    );
    expect(await mocks.getRagContext.mock.calls[0][2].recentMessages).toEqual(
      [],
    );
  });

  it("shares existing thread context with prompt and live retrieval decisions", async () => {
    const recentMessages = [
      { role: "assistant", content: "How did the preparation exercise feel?" },
    ];
    mocks.buildThreadContext.mockResolvedValue({ messages: recentMessages });
    mocks.resolveMemoryRecallMode.mockResolvedValue({
      mode: "active",
      reason: "configured",
    });
    mocks.createMemoryTools.mockReturnValue({
      recallFacts: {},
      getMemories: {},
    });
    const controller = new AbortController();
    await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      conversationThreadId: "thread-1",
      userMessage: "That approach made it worse",
      effectiveEntitlements: entitlements,
      abortSignal: controller.signal,
    });
    const contextOptions = mocks.buildRecallContext.mock.calls[0][0];
    const toolOptions = mocks.createRagTools.mock.calls[0][0].retrievalOptions;
    expect(await contextOptions.recentMessages).toEqual(recentMessages);
    expect(toolOptions.recentMessages).toBe(contextOptions.recentMessages);
    expect(toolOptions).toMatchObject({
      userId: "user-1",
      abortSignal: controller.signal,
    });
    expect(mocks.createMemoryTools).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ retrievalOptions: toolOptions }),
    );
    expect(mocks.buildThreadContext).toHaveBeenCalledTimes(1);
  });

  it("passes the same retrieval context to the prepared legacy prefetch path", async () => {
    await streamChat({
      userId: "user-1",
      userMessage: "Aiutami a preparare la gara",
      effectiveEntitlements: entitlements,
      preparedTurnContext: {
        capabilityPlannerMode: "legacy",
        turnDecision: {
          ...decision,
          capabilities: { ...decision.capabilities, rag: true },
        },
      },
    });
    expect(mocks.getRagContext).toHaveBeenCalledWith(
      "Aiutami a preparare la gara",
      undefined,
      expect.objectContaining({
        userId: "user-1",
        recentMessages: expect.any(Promise),
      }),
    );
  });

  it.each([false, true])(
    "uses the same scope and grouped-question policy for guest=%s",
    async (isGuest) => {
      await streamChat({
        userId: "synthetic-user",
        chatId: "synthetic-chat",
        userMessage: "Aiutami a preparare l'esame",
        isGuest,
        effectiveEntitlements: entitlements,
      });
      const prompt = mocks.streamText.mock.calls.at(-1)?.[0]
        .instructions as string;
      expect(prompt).toContain("study, work, sport");
      expect(prompt).toContain(
        "Group tightly related questions into one compact block",
      );
      expect(prompt).toContain(
        "make a clear recommendation with reasons and trade-offs",
      );
      expect(prompt).toContain(
        "a neutral, brief safety direction to a doctor, pediatrician, or emergency service",
      );
      expect(prompt).not.toMatch(
        /coach for sports performance|one (?:focused |follow-up )?question at a time|do not choose for the user/i,
      );
    },
  );
  it("attributes each completed model step once, without adding the final total again", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "Aiutami a concentrarmi",
      effectiveEntitlements: entitlements,
    });
    const callbacks = mocks.streamText.mock.calls.at(-1)?.[0];
    for (const cost of [0.001, 0.002]) {
      callbacks.onStepEnd({
        finishReason: "stop",
        text: "answer",
        model: { modelId: "provider/executed-model" },
        usage: { inputTokens: 100, outputTokens: 20 },
        providerMetadata: { openrouter: { usage: { cost } } },
      });
    }
    await callbacks.onEnd({
      text: "answer",
      usage: { inputTokens: 100, outputTokens: 20 },
      totalUsage: { inputTokens: 200, outputTokens: 40 },
    });

    expect(recordAiOperation).toHaveBeenCalledTimes(2);
    expect(recordAiOperation).toHaveBeenLastCalledWith({
      operation: "coaching",
      modelId: "provider/executed-model",
      usage: { inputTokens: 100, outputTokens: 20 },
      providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
    });
  });

  it("counts an exposed stream error once when the same step ends with error", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "Aiutami a concentrarmi",
      effectiveEntitlements: entitlements,
    });
    const callbacks = mocks.streamText.mock.calls.at(-1)?.[0];
    const error = new Error("provider unavailable");
    callbacks.onError({ error });
    callbacks.onStepEnd({ finishReason: "error", text: "" });

    expect(recordAiOperationFailure).toHaveBeenCalledExactlyOnceWith(
      "coaching",
      "provider/model",
      error,
    );
    expect(recordAiOperation).not.toHaveBeenCalled();
  });
});
