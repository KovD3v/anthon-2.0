import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureAiGenerationMetadata: vi.fn(),
  dnsLookup: vi.fn(),
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
  generateText: vi.fn(),
  outputObject: vi.fn(),
  isStepCount: vi.fn(),
  streamText: vi.fn(),
  extractAIMetrics: vi.fn(),
  getModelForUser: vi.fn(),
  getModelById: vi.fn(),
  getModelIdForPlan: vi.fn(),
  getRagContext: vi.fn(),
  shouldUseRag: vi.fn(),
  buildConversationContext: vi.fn(),
  buildThreadContext: vi.fn(),
  createMemoryTools: vi.fn(),
  createRoutineProposalTool: vi.fn(),
  createRagTools: vi.fn(),
  formatMemoriesForPrompt: vi.fn(),
  createTinyfishTools: vi.fn(),
  searchTinyfishDirect: vi.fn(),
  createUserContextTools: vi.fn(),
  formatTinyUserSnapshotForPrompt: vi.fn(),
  formatUserContextForPrompt: vi.fn(),
  measure: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  getVoicePlanConfig: vi.fn(),
  openrouter: vi.fn(),
  trackSupportAiUsage: vi.fn(),
  classifyCapabilities: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.dnsLookup,
}));

vi.mock("ai", () => ({
  createUIMessageStream: mocks.createUIMessageStream,
  createUIMessageStreamResponse: mocks.createUIMessageStreamResponse,
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
  isStepCount: mocks.isStepCount,
  streamText: mocks.streamText,
}));

vi.mock("@/lib/ai/cost-calculator", () => ({
  extractAIMetrics: mocks.extractAIMetrics,
}));

vi.mock("@/lib/ai/telemetry", () => ({
  captureAiGenerationMetadata: mocks.captureAiGenerationMetadata,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  getModelForUser: mocks.getModelForUser,
  getModelById: mocks.getModelById,
  getModelIdForPlan: mocks.getModelIdForPlan,
  openrouter: mocks.openrouter,
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

vi.mock("@/lib/ai/rag", () => ({
  getRagContext: mocks.getRagContext,
  shouldUseRag: mocks.shouldUseRag,
}));

vi.mock("@/lib/ai/session-manager", () => ({
  buildConversationContext: mocks.buildConversationContext,
}));

vi.mock("@/lib/ai/thread-context", () => ({
  buildThreadContext: mocks.buildThreadContext,
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  createMemoryTools: mocks.createMemoryTools,
  formatMemoriesForPrompt: mocks.formatMemoriesForPrompt,
}));

vi.mock("@/lib/ai/tools/routine-proposal", () => ({
  createRoutineProposalTool: mocks.createRoutineProposalTool,
}));

vi.mock("@/lib/ai/tools/rag", () => ({
  createRagTools: mocks.createRagTools,
}));

vi.mock("@/lib/ai/tools/tinyfish", () => ({
  createTinyfishTools: mocks.createTinyfishTools,
  searchTinyfishDirect: mocks.searchTinyfishDirect,
}));

vi.mock("@/lib/ai/tools/user-context", () => ({
  createUserContextTools: mocks.createUserContextTools,
  formatTinyUserSnapshotForPrompt: mocks.formatTinyUserSnapshotForPrompt,
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

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

vi.mock("./capability-arbitration", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./capability-arbitration")>();

  return {
    ...actual,
    classifyCapabilities: mocks.classifyCapabilities,
  };
});

import {
  executePreparedChatTurn,
  prepareChatTurn,
  streamChat,
} from "./orchestrator";

const TRUSTED_BLOB_ORIGIN = "https://store.public.blob.vercel-storage.com";
const TRUSTED_IMAGE_URL = `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-image/photo.jpg`;
const VALID_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const VALID_WEBM_BYTES = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

function createTrustedImageFetch(openRouterResponse: Response) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input) === TRUSTED_IMAGE_URL) {
      return new Response(VALID_JPEG_BYTES, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(VALID_JPEG_BYTES.byteLength),
        },
      });
    }
    return openRouterResponse;
  });
}

function countOccurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

async function readTextStream(stream: AsyncIterable<string>) {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

const baseEntitlements = {
  limits: {
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 10000,
    maxOutputTokensPerDay: 8000,
    maxCostPerDay: 10,
    maxContextMessages: 20,
  },
  uploadLimits: {
    maxUploadsPerDay: 25,
    maxUploadBytesPerDay: 250 * 1024 * 1024,
  },
  modelTier: "BASIC",
  sources: [],
};

describe("ai/orchestrator", () => {
  beforeEach(() => {
    mocks.captureAiGenerationMetadata.mockReset();
    mocks.dnsLookup.mockReset();
    mocks.createUIMessageStream.mockReset();
    mocks.createUIMessageStreamResponse.mockReset();
    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.isStepCount.mockReset();
    mocks.streamText.mockReset();
    mocks.extractAIMetrics.mockReset();
    mocks.getModelForUser.mockReset();
    mocks.getModelById.mockReset();
    mocks.getModelIdForPlan.mockReset();
    mocks.getRagContext.mockReset();
    mocks.shouldUseRag.mockReset();
    mocks.buildConversationContext.mockReset();
    mocks.buildThreadContext.mockReset();
    mocks.createMemoryTools.mockReset();
    mocks.createRoutineProposalTool.mockReset();
    mocks.createRagTools.mockReset();
    mocks.formatMemoriesForPrompt.mockReset();
    mocks.createTinyfishTools.mockReset();
    mocks.searchTinyfishDirect.mockReset();
    mocks.createUserContextTools.mockReset();
    mocks.formatTinyUserSnapshotForPrompt.mockReset();
    mocks.formatUserContextForPrompt.mockReset();
    mocks.measure.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.getVoicePlanConfig.mockReset();
    mocks.openrouter.mockReset();
    mocks.trackSupportAiUsage.mockReset();
    mocks.classifyCapabilities.mockReset();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T16:00:00.000Z"));

    vi.stubGlobal("atob", (value: string) =>
      Buffer.from(value, "base64").toString("binary"),
    );

    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );
    mocks.isStepCount.mockImplementation((count: number) => `stop-${count}`);
    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.getModelForUser.mockReturnValue("base-model");
    mocks.getModelById.mockReturnValue("candidate-model");
    mocks.getModelIdForPlan.mockReturnValue("google/gemini-test");
    mocks.dnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.openrouter.mockImplementation((modelId: string) => ({
      modelId,
      provider: "openrouter",
    }));
    mocks.createUIMessageStream.mockImplementation(
      ({
        execute,
      }: {
        execute: (input: {
          writer: { write: (part: unknown) => void };
        }) => Promise<void>;
      }) =>
        new ReadableStream({
          async start(controller) {
            await execute({
              writer: {
                write: (part: unknown) => controller.enqueue(part),
              },
            });
            controller.close();
          },
        }),
    );
    mocks.createUIMessageStreamResponse.mockReturnValue(new Response("stream"));
    mocks.shouldUseRag.mockResolvedValue(false);
    mocks.getRagContext.mockResolvedValue({
      text: "unused rag",
      chunkCount: 1,
    });
    mocks.buildConversationContext.mockResolvedValue([
      { role: "user", content: "same message" },
    ]);
    mocks.buildThreadContext.mockResolvedValue({ messages: [] });
    mocks.formatUserContextForPrompt.mockResolvedValue("user-context-data");
    mocks.formatMemoriesForPrompt.mockResolvedValue("user-memories-data");
    mocks.createMemoryTools.mockReturnValue({
      getMemories: "memory-read-tool",
      saveMemory: "memory-tool",
      requestMemoryApproval: "memory-approval-request-tool",
      resolveMemoryApproval: "memory-approval-resolve-tool",
      deleteMemory: "memory-delete-tool",
    });
    mocks.createRoutineProposalTool.mockReturnValue({
      proposeRoutine: "routine-proposal-tool",
    });
    mocks.createRagTools.mockReturnValue({
      searchRag: "rag-tool",
    });
    mocks.createUserContextTools.mockReturnValue({
      getUserContext: "context-read-tool",
      updateProfile: "profile-tool",
      updatePreferences: "preferences-tool",
      addNotes: "notes-tool",
    });
    mocks.createTinyfishTools.mockReturnValue({
      tinyfishSearch: "tinyfish-tool",
      tinyfishFetch: "tinyfish-fetch-tool",
    });
    mocks.searchTinyfishDirect.mockResolvedValue({
      query: "prossima partita messi",
      results: [
        {
          title: "Messi schedule",
          url: "https://example.com/messi",
          content: "Inter Miami will play next on Saturday.",
          siteName: "example.com",
          position: 1,
        },
      ],
      totalResults: 1,
      page: 0,
    });
    mocks.formatTinyUserSnapshotForPrompt.mockResolvedValue(
      "Lingua: it\nSport: tennis\nObiettivo: focus pre-gara",
    );
    mocks.resolveEffectiveEntitlements.mockResolvedValue(baseEntitlements);
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
    mocks.classifyCapabilities.mockResolvedValue(null);
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
    mocks.generateText.mockResolvedValue({
      output: {
        webSearch: "no",
        webFetch: "no",
        rag: "no",
        userContext: "needed",
        confidence: 0.5,
        reason: "uncertain",
      },
      usage: {
        inputTokens: 8,
        outputTokens: 10,
        totalTokens: 18,
      },
      providerMetadata: {
        openrouter: {
          cost: 0.00001,
        },
      },
    });
    mocks.streamText.mockReturnValue({ marker: "stream-result" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards abort signals to prepared experiment generations", () => {
    const abortController = new AbortController();

    executePreparedChatTurn({
      prepared: {
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        userMessageId: "message-1",
        userMessage: "help me focus",
        planId: "basic",
        userRole: "USER",
        effectiveModelTier: "BASIC",
        systemPrompt: "coach prompt",
        messages: [
          { role: "system", content: "previous thread summary" },
          { role: "user", content: "help me focus" },
        ],
        turnPlan: {
          responseLength: "brief",
        } as never,
        promptMode: "full",
        ragUsed: false,
        ragChunksCount: 0,
      },
      abortSignal: abortController.signal,
      modelId: "provider/candidate",
      generationConfig: { fallbacks: false },
      clerkId: "clerk-1",
      traceId: "trace-1",
      experimentId: "experiment-1",
      pairId: "pair-1",
      role: "CANDIDATE",
    });

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: abortController.signal,
        messages: [{ role: "user", content: "help me focus" }],
        instructions: expect.stringContaining("previous thread summary"),
      }),
    );
  });

  it("does not cap brief prepared generations below their visible response", () => {
    executePreparedChatTurn({
      prepared: {
        userId: "user-1",
        chatId: "chat-brief",
        conversationThreadId: "thread-brief",
        userMessageId: "message-brief",
        userMessage: "Preparami una routine mentale breve per domani",
        planId: "basic",
        userRole: "USER",
        effectiveModelTier: "BASIC",
        systemPrompt: "coach prompt",
        messages: [
          {
            role: "user",
            content: "Preparami una routine mentale breve per domani",
          },
        ],
        turnPlan: {
          responseLength: "brief",
        } as never,
        promptMode: "full",
        ragUsed: false,
        ragChunksCount: 0,
      },
      modelId: "provider/candidate",
      generationConfig: { fallbacks: false },
      clerkId: "clerk-1",
      traceId: "trace-brief",
      experimentId: "experiment-1",
      pairId: "pair-brief",
      role: "CANDIDATE",
    });

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: undefined }),
    );
  });

  it("forwards abort signals to experiment prompt preparation", async () => {
    const abortController = new AbortController();
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");

    await prepareChatTurn({
      userId: "user-1",
      abortSignal: abortController.signal,
      chatId: "chat-1",
      conversationThreadId: "thread-1",
      userMessageId: "message-1",
      userMessage: "Mi aggiorni sulla situazione di Messi?",
      effectiveEntitlements: baseEntitlements as never,
      skipConversationHistory: true,
    });

    expect(mocks.classifyCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    );
  });

  it("does not downgrade an aborted experiment classifier to fallback planning", async () => {
    const abortController = new AbortController();
    const abortReason = new Error("request disconnected");
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockRejectedValueOnce(abortReason);

    await expect(
      prepareChatTurn({
        userId: "user-1",
        abortSignal: abortController.signal,
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        userMessageId: "message-1",
        userMessage: "Mi aggiorni sulla situazione di Messi?",
        effectiveEntitlements: baseEntitlements as never,
        skipConversationHistory: true,
      }),
    ).rejects.toBe(abortReason);
    expect(mocks.buildThreadContext).not.toHaveBeenCalled();
  });

  it("keeps empty RAG retrieval out of paired prompts and telemetry", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
    });

    const prepared = await prepareChatTurn({
      userId: "user-1",
      chatId: "chat-rag-empty-paired",
      conversationThreadId: "thread-1",
      userMessageId: "message-1",
      userMessage: "Dammi una risposta breve usando i documenti caricati",
      effectiveEntitlements: baseEntitlements as never,
      skipConversationHistory: true,
    });

    expect(prepared.ragUsed).toBe(false);
    expect(prepared.ragChunksCount).toBe(0);
    expect(prepared.systemPrompt).not.toContain("RAG CONTEXT");
    expect(prepared.systemPrompt).not.toContain(
      "Nessun documento rilevante trovato.",
    );
  });

  it("builds stream payload for text messages and skips entitlement lookup when prefetched", async () => {
    const abortController = new AbortController();
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
      abortSignal: abortController.signal,
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
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "base-model",
        stopWhen: "stop-5",
        messages: [{ role: "user", content: "same message" }],
        tools: {},
        abortSignal: abortController.signal,
      }),
    );
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
    expect(streamInput.instructions).toContain("TEXT RESPONSE MODE");
    expect(streamInput.instructions).toContain("AI mental coach");
    expect(streamInput.instructions).toContain(
      "Never claim to be human, licensed, or a healthcare professional",
    );
    expect(streamInput.instructions).not.toContain(
      "NEVER say you are an AI or a model",
    );
    expect(streamInput.instructions).toContain(
      "Do not mention voice/audio availability",
    );
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.instructions).not.toContain("TOOL POLICY");
    expect(streamInput.instructions).not.toContain("RAG CONTEXT");
    expect(
      countOccurrences(streamInput.instructions, "user-context-data"),
    ).toBe(1);
    expect(
      countOccurrences(streamInput.instructions, "user-memories-data"),
    ).toBe(1);
  });

  it("moves system history into instructions before calling the AI SDK", async () => {
    mocks.buildConversationContext.mockResolvedValueOnce([
      { role: "system", content: "previous thread summary" },
      { role: "user", content: "previous question" },
      { role: "assistant", content: "previous answer" },
    ]);

    await streamChat({
      userId: "user-1",
      chatId: "chat-with-summary",
      userMessage: "new question",
      effectiveEntitlements: baseEntitlements as never,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(streamInput.messages).toEqual([
      { role: "user", content: "previous question" },
      { role: "assistant", content: "previous answer" },
      { role: "user", content: "new question" },
    ]);
    expect(streamInput.instructions).toContain("CONVERSATION HISTORY CONTEXT");
    expect(streamInput.instructions).toContain("previous thread summary");
    expect(streamInput.messages).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });

  it("keeps contextual short follow-ups on the full plan", async () => {
    mocks.buildConversationContext.mockResolvedValue([
      {
        role: "user",
        content: "Raccontami una breve storia su Messi",
      },
      {
        role: "assistant",
        content:
          "Messi era piccolo, ma continuò ad allenarsi fino a diventare un campione.",
      },
      {
        role: "user",
        content: "La storia la voglio più breve",
      },
    ]);

    await streamChat({
      userId: "user-1",
      chatId: "chat-simple-fast",
      userMessage: "La storia la voglio più breve",
    });

    expect(mocks.shouldUseRag).toHaveBeenCalled();
    expect(mocks.buildConversationContext).toHaveBeenCalledWith(
      "user-1",
      20,
      "chat-simple-fast",
    );
    expect(mocks.formatTinyUserSnapshotForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatUserContextForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatMemoriesForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.createMemoryTools).not.toHaveBeenCalled();
    expect(mocks.createUserContextTools).not.toHaveBeenCalled();
    expect(mocks.createTinyfishTools).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).toHaveBeenCalled();

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(streamInput.tools).toEqual({});
    expect(streamInput.messages).toEqual([
      {
        role: "user",
        content: "Raccontami una breve storia su Messi",
      },
      {
        role: "assistant",
        content:
          "Messi era piccolo, ma continuò ad allenarsi fino a diventare un campione.",
      },
      {
        role: "user",
        content: "La storia la voglio più breve",
      },
    ]);
    expect(streamInput.maxOutputTokens).toBeUndefined();
    expect(streamInput.instructions).toContain("LANGUAGE RULES");
    expect(streamInput.instructions).toContain(
      "Do not mention voice/audio availability",
    );
    expect(streamInput.instructions).toContain("USER CONTEXT");
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.instructions).not.toContain("WEB SEARCH");
    expect(streamInput.instructions).not.toContain("RAG CONTEXT");
    expect(streamInput.instructions).toContain("USER CONTEXT");
    expect(streamInput.instructions).toContain("USER MEMORIES");
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
  });

  it("uses full memory context when the user asks whether Anthon knows them", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-identity-recall",
      userMessage: "ciao sai chi sono?",
    });

    expect(mocks.formatTinyUserSnapshotForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatUserContextForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatMemoriesForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.createMemoryTools).toHaveBeenCalledWith("user-1");
    expect(mocks.createUserContextTools).toHaveBeenCalledWith("user-1");

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.instructions).toContain("USER CONTEXT");
    expect(streamInput.instructions).toContain("USER MEMORIES");
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        getMemories: "memory-read-tool",
        getUserContext: "context-read-tool",
      }),
    );
    expect(streamInput.maxOutputTokens).toBeUndefined();
  });

  it("keeps full prompt and only profile tools when the message contains profile data", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-profile-info",
      userMessage: "Mi chiamo Luca e gioco a tennis",
    });

    expect(mocks.formatUserContextForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatMemoriesForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatTinyUserSnapshotForPrompt).not.toHaveBeenCalled();

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        updateProfile: "profile-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updatePreferences");
    expect(streamInput.instructions).toContain("POST-GENERATION MEMORY");
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
    expect(streamInput.maxOutputTokens).toBeUndefined();
  });

  it("passes a stable OpenRouter session id for provider-side session caching", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-session-cache",
      userMessage: "same message",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      providerOptions: {
        openrouter: {
          session_id?: string;
        };
      };
      headers?: Record<string, string>;
    };
    expect(streamInput.providerOptions.openrouter.session_id).toBe(
      "chat-session-cache",
    );
    expect(streamInput.headers?.["x-session-id"]).toBe("chat-session-cache");
  });

  it("keeps complex coaching on full prompt without exposing persistent write tools", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-complex-no-write",
      userMessage: "Fammi un piano dettagliato per la settimana",
    });

    expect(mocks.formatUserContextForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatMemoriesForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.createMemoryTools).not.toHaveBeenCalled();
    expect(mocks.createUserContextTools).not.toHaveBeenCalled();

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.tools).toEqual({
      proposeRoutine: "routine-proposal-tool",
    });
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.instructions).toContain("TOOL POLICY");
    expect(streamInput.maxOutputTokens).toBeUndefined();
  });

  it("keeps RAG classification for simple wording that references documents", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue({
      text: "**Doc A**\ncontext",
      chunkCount: 1,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-rag-intent",
      userMessage: "Dammi una risposta breve usando i documenti caricati",
    });

    expect(mocks.shouldUseRag).toHaveBeenCalledWith(
      "Dammi una risposta breve usando i documenti caricati",
      { userId: "user-1" },
    );
    expect(mocks.formatUserContextForPrompt).toHaveBeenCalledWith("user-1");
    expect(mocks.formatMemoriesForPrompt).toHaveBeenCalledWith("user-1");

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.instructions).toContain("RAG CONTEXT");
    expect(streamInput.tools).toEqual({});
    expect(mocks.createMemoryTools).not.toHaveBeenCalled();
    expect(mocks.createUserContextTools).not.toHaveBeenCalled();
    expect(streamInput.maxOutputTokens).toBeUndefined();
  });

  it("does not mark RAG as used when retrieval returns no chunks", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-rag-empty",
      userMessage: "Dammi una risposta breve usando i documenti caricati",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      onEnd: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };
    expect(streamInput.instructions).not.toContain("RAG CONTEXT");
    expect(streamInput.instructions).not.toContain(
      "Nessun documento rilevante trovato.",
    );

    await streamInput.onEnd({
      text: "answer",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      providerMetadata: {},
    });

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-test",
      expect.any(Number),
      expect.objectContaining({
        ragUsed: false,
        ragChunksCount: 0,
      }),
    );
  });

  it("routes a compact quality prompt suite without sending complex requests to simple fast mode", async () => {
    const fastPrompts = [
      "Ciao",
      "Motivami prima dell'allenamento",
      "Caricami in poche parole",
      "Consiglio veloce per restare concentrato",
      "Reset mentale rapido",
      "Tranquillizzami prima della gara",
    ];

    const fullPrompts = [
      {
        text: "Mi chiamo Luca e gioco a tennis",
        writes: true,
        generationTools: true,
      },
      {
        text: "Ricordati che domenica ho una partita",
        writes: true,
        generationTools: false,
      },
      {
        text: "Fammi un piano dettagliato per la settimana",
        writes: false,
      },
      {
        text: "Analizza il mio problema di concentrazione",
        writes: false,
      },
      {
        text: "Secondo i documenti caricati, cosa devo fare?",
        writes: false,
      },
      {
        text: "Usa internet e dimmi le ultime notizie sportive",
        writes: false,
        web: true,
      },
      { text: "Ho dolore al ginocchio, cosa faccio?", writes: false },
      { text: "Mandami un vocale motivazionale", writes: false },
      {
        text: "Confronta due strategie pre-gara in una tabella",
        writes: false,
      },
      {
        text: "Ho 17 anni e il mio obiettivo è migliorare il servizio",
        writes: true,
        generationTools: true,
      },
    ];

    for (const prompt of fastPrompts) {
      mocks.streamText.mockClear();
      mocks.formatTinyUserSnapshotForPrompt.mockClear();
      mocks.formatUserContextForPrompt.mockClear();
      mocks.formatMemoriesForPrompt.mockClear();
      mocks.shouldUseRag.mockClear();

      await streamChat({
        userId: "user-1",
        chatId: `chat-fast-${prompt.length}`,
        userMessage: prompt,
      });

      const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
        instructions: string;
        tools: Record<string, unknown>;
        maxOutputTokens?: number;
      };
      expect(streamInput.instructions, prompt).toContain("USER SNAPSHOT");
      expect(streamInput.tools, prompt).toEqual({});
      expect(streamInput.maxOutputTokens, prompt).toBeUndefined();
      expect(mocks.formatTinyUserSnapshotForPrompt, prompt).toHaveBeenCalled();
      expect(mocks.formatUserContextForPrompt, prompt).not.toHaveBeenCalled();
      expect(mocks.formatMemoriesForPrompt, prompt).not.toHaveBeenCalled();
    }

    for (const promptCase of fullPrompts) {
      mocks.streamText.mockClear();
      mocks.formatTinyUserSnapshotForPrompt.mockClear();
      mocks.formatUserContextForPrompt.mockClear();
      mocks.formatMemoriesForPrompt.mockClear();
      mocks.shouldUseRag.mockClear();

      await streamChat({
        userId: "user-1",
        chatId: `chat-full-${promptCase.text.length}`,
        userMessage: promptCase.text,
      });

      const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
        instructions: string;
        tools: Record<string, unknown>;
        maxOutputTokens?: number;
      };
      if (promptCase.web) {
        expect(streamInput.instructions, promptCase.text).toContain(
          "WEB SEARCH",
        );
        expect(streamInput.instructions, promptCase.text).not.toContain(
          "USER CONTEXT",
        );
        expect(streamInput.instructions, promptCase.text).not.toContain(
          "user-context-data",
        );
      } else {
        expect(streamInput.instructions, promptCase.text).toContain(
          "user-context-data",
        );
      }
      if (promptCase.writes) {
        expect(streamInput.instructions, promptCase.text).toContain(
          "POST-GENERATION MEMORY",
        );
        if (promptCase.generationTools) {
          expect(streamInput.tools, promptCase.text).not.toEqual({});
        } else {
          expect(streamInput.tools, promptCase.text).toEqual({});
        }
      } else {
        expect(streamInput.instructions, promptCase.text).not.toContain(
          "POST-GENERATION MEMORY",
        );
      }
      expect(streamInput.maxOutputTokens, promptCase.text).toBeUndefined();
      expect(
        mocks.formatTinyUserSnapshotForPrompt,
        promptCase.text,
      ).not.toHaveBeenCalled();
      expect(
        mocks.formatUserContextForPrompt,
        promptCase.text,
      ).toHaveBeenCalledTimes(promptCase.web ? 0 : 1);
      expect(
        mocks.formatMemoriesForPrompt,
        promptCase.text,
      ).toHaveBeenCalledTimes(promptCase.web ? 0 : 1);
    }
  });

  it("uses an explicit benchmark model id without changing runtime plan routing", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "same message",
      benchmarkModelId: "candidate/model",
      onFinish: vi.fn(),
    });

    expect(mocks.getModelById).toHaveBeenCalledWith("candidate/model");
    expect(mocks.getModelForUser).not.toHaveBeenCalled();
    expect(mocks.getModelIdForPlan).not.toHaveBeenCalled();
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      onEnd?: (input: {
        text: string;
        usage?: { inputTokens?: number; outputTokens?: number };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };
    await streamInput.onEnd?.({
      text: "assistant",
      usage: { inputTokens: 1, outputTokens: 2 },
      providerMetadata: {},
    });

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "candidate/model",
      expect.any(Number),
      expect.objectContaining({ text: "assistant" }),
    );
    expect(mocks.captureAiGenerationMetadata).toHaveBeenCalledWith({
      context: expect.objectContaining({
        distinctId: "user-1",
        traceId: "chat-1",
      }),
      metrics: expect.objectContaining({ inputTokens: 10, outputTokens: 20 }),
    });
  });

  it("routes image messages through OpenRouter REST with image_url content", async () => {
    const abortController = new AbortController();
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const fetchSpy = createTrustedImageFetch(
      Response.json({
        id: "gen-1",
        model: "google/gemini-2.5-flash-lite",
        choices: [
          {
            message: {
              content: "Vedo una scena sportiva.",
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 12,
          total_tokens: 112,
          cost: 0.0003,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const uiStreamParts: unknown[] = [];
    let executeUIStream: Promise<void> | undefined;
    mocks.createUIMessageStream.mockImplementationOnce(
      ({
        execute,
      }: {
        execute: (input: {
          writer: { write: (part: unknown) => void };
        }) => Promise<void>;
      }) => {
        executeUIStream = execute({
          writer: {
            write: (part: unknown) => uiStreamParts.push(part),
          },
        });
        return new ReadableStream();
      },
    );

    let text = "";
    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image",
        userMessage: "cosa vedi?",
        hasImages: true,
        abortSignal: abortController.signal,
        messageParts: [
          { type: "text", text: "cosa vedi?" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });
      for await (const chunk of result.textStream) {
        text += chunk;
      }
      result.toUIMessageStreamResponse();
      await executeUIStream;
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(mocks.getModelById).toHaveBeenCalledWith(
      "google/gemini-2.5-flash-lite",
    );
    expect(mocks.getModelForUser).not.toHaveBeenCalled();
    expect(mocks.getModelIdForPlan).not.toHaveBeenCalled();
    expect(text).toBe("Vedo una scena sportiva.");
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(
      uiStreamParts.find(
        (part) =>
          Boolean(part && typeof part === "object" && "type" in part) &&
          (part as { type?: unknown }).type === "finish",
      ),
    ).toEqual({
      type: "finish",
      finishReason: "stop",
      messageMetadata: {
        inputTokens: 10,
        outputTokens: 20,
        generationTimeMs: 123,
        reasoningTimeMs: undefined,
      },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openrouter-key",
          "Content-Type": "application/json",
        }),
        signal: abortController.signal,
      }),
    );

    const openRouterCall = fetchSpy.mock.calls.find(
      ([input]) =>
        String(input) === "https://openrouter.ai/api/v1/chat/completions",
    );
    const requestBody = JSON.parse(
      (openRouterCall?.[1] as { body: string }).body,
    );
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: "google/gemini-2.5-flash-lite",
        usage: { include: true },
      }),
    );
    expect(requestBody.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "same message" },
      {
        role: "user",
        content: [
          { type: "text", text: "cosa vedi?" },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${VALID_JPEG_BYTES.toString("base64")}`,
            },
          },
        ],
      },
    ]);
    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-2.5-flash-lite",
      expect.any(Number),
      expect.objectContaining({
        text: "Vedo una scena sportiva.",
        usage: {
          promptTokens: 100,
          completionTokens: 12,
          totalTokens: 112,
        },
        providerMetadata: {
          openrouter: expect.objectContaining({
            id: "gen-1",
            model: "google/gemini-2.5-flash-lite",
            usage: expect.objectContaining({ cost: 0.0003 }),
          }),
        },
      }),
    );
    expect(mocks.captureAiGenerationMetadata).toHaveBeenCalledWith({
      context: expect.objectContaining({
        distinctId: "user-1",
        traceId: "chat-image",
      }),
      metrics: expect.objectContaining({ inputTokens: 10, outputTokens: 20 }),
    });
  });

  it("reads OpenRouter image text from array content parts", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const fetchSpy = createTrustedImageFetch(
      Response.json({
        id: "gen-array-content",
        model: "google/gemini-2.5-flash-lite",
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "Vedo il caricamento " },
                { type: "text", text: "del gesto atletico." },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 9,
          total_tokens: 89,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image-array-content",
        userMessage: "cosa vedi?",
        hasImages: true,
        messageParts: [
          { type: "text", text: "cosa vedi?" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });

      await expect(readTextStream(result.textStream)).resolves.toBe(
        "Vedo il caricamento del gesto atletico.",
      );
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-2.5-flash-lite",
      expect.any(Number),
      expect.objectContaining({
        text: "Vedo il caricamento del gesto atletico.",
      }),
    );
  });

  it("uses OpenRouter image reasoning when content is empty", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    vi.stubGlobal(
      "fetch",
      createTrustedImageFetch(
        Response.json({
          id: "gen-reasoning",
          model: "google/gemini-2.5-flash-lite",
          choices: [
            {
              message: {
                content: "",
                reasoning: "L'immagine mostra una postura stabile.",
              },
            },
          ],
        }),
      ),
    );

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image-reasoning",
        userMessage: "analizza",
        hasImages: true,
        messageParts: [
          { type: "text", text: "analizza" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });

      await expect(readTextStream(result.textStream)).resolves.toBe(
        "L'immagine mostra una postura stabile.",
      );
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });

  it("rejects OpenRouter image responses without text and does not call onFinish", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const onFinish = vi.fn();
    vi.stubGlobal(
      "fetch",
      createTrustedImageFetch(
        Response.json({
          id: "gen-empty",
          choices: [
            {
              message: {
                content: [],
              },
            },
          ],
        }),
      ),
    );

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image-empty",
        userMessage: "analizza",
        hasImages: true,
        onFinish,
        messageParts: [
          { type: "text", text: "analizza" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });

      await expect(readTextStream(result.textStream)).rejects.toThrow(
        "OpenRouter multimodal chat returned no text content",
      );
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(onFinish).not.toHaveBeenCalled();
  });

  it("propagates OpenRouter image HTTP failures", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const cases = [
      { status: 429, payload: { error: { message: "rate limited" } } },
      { status: 500, payload: { error: { message: "server error" } } },
    ];

    try {
      for (const { status, payload } of cases) {
        process.env.OPENROUTER_API_KEY = "test-openrouter-key";
        vi.stubGlobal(
          "fetch",
          createTrustedImageFetch(Response.json(payload, { status })),
        );

        const result = await streamChat({
          userId: "user-1",
          chatId: `chat-image-http-${status}`,
          userMessage: "analizza",
          hasImages: true,
          messageParts: [
            { type: "text", text: "analizza" },
            {
              type: "file",
              data: TRUSTED_IMAGE_URL,
              mimeType: "image/jpeg",
              size: VALID_JPEG_BYTES.byteLength,
            },
          ],
        });

        await expect(readTextStream(result.textStream)).rejects.toThrow(
          `OpenRouter multimodal chat failed: ${status} ${JSON.stringify(
            payload,
          )}`,
        );
      }
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });

  it("fails before fetch when OpenRouter image chat has no API key", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image-missing-key",
        userMessage: "analizza",
        hasImages: true,
        messageParts: [
          { type: "text", text: "analizza" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });

      await expect(readTextStream(result.textStream)).rejects.toThrow(
        "OPENROUTER_API_KEY is required for multimodal chat",
      );
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("applies custom direct multimodal finish metadata and preserves UI event order", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    vi.stubGlobal(
      "fetch",
      createTrustedImageFetch(
        Response.json({
          id: "gen-ui-stream",
          model: "google/gemini-2.5-flash-lite",
          choices: [
            {
              message: {
                content: "Assetto stabile.",
              },
            },
          ],
          usage: {
            prompt_tokens: 70,
            completion_tokens: 6,
            total_tokens: 76,
          },
        }),
      ),
    );
    const uiStreamParts: unknown[] = [];
    let executeUIStream: Promise<void> | undefined;
    mocks.createUIMessageStream.mockImplementationOnce(
      ({
        execute,
      }: {
        execute: (input: {
          writer: { write: (part: unknown) => void };
        }) => Promise<void>;
      }) => {
        executeUIStream = execute({
          writer: {
            write: (part: unknown) => uiStreamParts.push(part),
          },
        });
        return new ReadableStream();
      },
    );
    const messageMetadata = vi.fn(({ part }) => ({
      custom: "finish-metadata",
      finishReason: (part as { finishReason?: unknown }).finishReason,
      inputTokens: (part as { usage?: { inputTokens?: unknown } }).usage
        ?.inputTokens,
    }));

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-image-ui-stream",
        userMessage: "analizza",
        hasImages: true,
        messageParts: [
          { type: "text", text: "analizza" },
          {
            type: "file",
            data: TRUSTED_IMAGE_URL,
            mimeType: "image/jpeg",
            size: VALID_JPEG_BYTES.byteLength,
          },
        ],
      });

      result.toUIMessageStreamResponse({ messageMetadata });
      await executeUIStream;
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(messageMetadata).toHaveBeenCalledWith({
      part: {
        type: "finish",
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
        totalUsage: {
          inputTokens: 10,
          outputTokens: 20,
        },
      },
    });
    expect(uiStreamParts).toEqual([
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Assetto stabile." },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      {
        type: "finish",
        finishReason: "stop",
        messageMetadata: {
          custom: "finish-metadata",
          finishReason: "stop",
          inputTokens: 10,
        },
      },
    ]);
  });

  it("routes PDF messages through OpenRouter REST with file content", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url === `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-pdf/doc.pdf`
      ) {
        return new Response(Buffer.from("%PDF-1.7 sample"), {
          headers: { "Content-Type": "application/pdf" },
        });
      }

      return Response.json({
        id: "gen-pdf",
        model: "google/gemini-2.5-flash-lite",
        choices: [
          {
            message: {
              content: "Il PDF parla di tecnica.",
            },
          },
        ],
        usage: {
          prompt_tokens: 90,
          completion_tokens: 10,
          total_tokens: 100,
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-pdf",
        userMessage: "riassumi",
        messageParts: [
          { type: "text", text: "riassumi" },
          {
            type: "file",
            data: `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-pdf/doc.pdf`,
            mimeType: "application/pdf",
            name: "doc.pdf",
          },
        ],
      });

      let text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }
      expect(text).toBe("Il PDF parla di tecnica.");
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(`${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-pdf/doc.pdf`),
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(mocks.streamText).not.toHaveBeenCalled();

    const openRouterCall = (
      fetchSpy.mock.calls as unknown as Array<[URL | RequestInfo, RequestInit?]>
    ).find(
      ([input]) =>
        String(input) === "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(openRouterCall).toBeTruthy();
    const requestBody = JSON.parse(
      (openRouterCall?.[1] as { body: string }).body,
    );
    expect(requestBody.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "riassumi" },
        {
          type: "file",
          file: {
            filename: "doc.pdf",
            file_data: `data:application/pdf;base64,${Buffer.from(
              "%PDF-1.7 sample",
            ).toString("base64")}`,
          },
        },
      ],
    });
  });

  it("routes video messages through OpenRouter REST with file content", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const videoBytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url === `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-video/clip.mp4`
      ) {
        return new Response(videoBytes, {
          headers: { "Content-Type": "video/mp4" },
        });
      }

      return Response.json({
        id: "gen-video",
        model: "google/gemini-2.5-flash-lite",
        choices: [
          {
            message: {
              content: "Nel video vedo un movimento laterale.",
            },
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 15,
          total_tokens: 135,
        },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const result = await streamChat({
        userId: "user-1",
        chatId: "chat-video",
        userMessage: "analizza il movimento",
        messageParts: [
          { type: "text", text: "analizza il movimento" },
          {
            type: "file",
            data: `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-video/clip.mp4`,
            mimeType: "video/mp4",
            name: "clip.mp4",
          },
        ],
      });

      let text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }
      expect(text).toBe("Nel video vedo un movimento laterale.");
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }

    expect(mocks.streamText).not.toHaveBeenCalled();
    const openRouterCall = (
      fetchSpy.mock.calls as unknown as Array<[URL | RequestInfo, RequestInit?]>
    ).find(
      ([input]) =>
        String(input) === "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(openRouterCall).toBeTruthy();
    const requestBody = JSON.parse(
      (openRouterCall?.[1] as { body: string }).body,
    );
    expect(requestBody.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "analizza il movimento" },
        {
          type: "file",
          file: {
            filename: "clip.mp4",
            file_data: `data:video/mp4;base64,${videoBytes.toString("base64")}`,
          },
        },
      ],
    });
  });

  it("degrades unsupported video attachments to text when the selected model is image-only", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-image-only-video",
      userMessage: "",
      benchmarkModelId: "image-only/model",
      messageParts: [
        {
          type: "file",
          data: `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-video/clip.mp4`,
          mimeType: "video/mp4",
          name: "clip.mp4",
        },
      ],
    });

    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(streamInput.messages.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: expect.stringContaining("video/mp4"),
        },
      ],
    });
    expect(JSON.stringify(streamInput.messages.at(-1))).not.toContain(
      `${TRUSTED_BLOB_ORIGIN}/attachments/user-1/chat-video/clip.mp4`,
    );
  });

  it("enables one non-persistent routine proposal tool for eligible coaching turns", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-routine-proposal",
      userMessage:
        "Dopo un errore in partita perdo fiducia: dammi una routine pratica.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({ proposeRoutine: "routine-proposal-tool" }),
    );
    expect(streamInput.instructions).toContain("proposeRoutine");
    expect(streamInput.instructions).toContain("never a saved routine");
    expect(streamInput.instructions).toContain("formatVersion 2");
    expect(streamInput.instructions).toContain("stable, descriptive id");
    expect(streamInput.instructions).toContain("PARTIALLY_HELPFUL");
    expect(mocks.getModelForUser).toHaveBeenCalledWith(
      undefined,
      undefined,
      "orchestrator",
      "BASIC",
      undefined,
      { parallelToolCalls: false },
    );
  });

  it("enables the routine proposal tool for eligible guest coaching turns", async () => {
    await streamChat({
      userId: "guest-user-1",
      chatId: "guest-chat-routine-proposal",
      isGuest: true,
      userMessage: "Prima della gara ho ansia: dammi una routine di reset.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({
      proposeRoutine: "routine-proposal-tool",
    });
    expect(streamInput.instructions).toContain("proposeRoutine");
  });

  it("enables the routine proposal tool for eligible compact coaching practice", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-routine-proposal-compact",
      userMessage:
        "Consiglio rapido in 3 passi per la concentrazione prima di una gara",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({
      proposeRoutine: "routine-proposal-tool",
    });
    expect(streamInput.instructions).toContain("ROUTINE PROPOSAL");
    expect(streamInput.instructions).toContain("proposeRoutine");
  });

  it("requires one structured routine proposal before returning the coaching answer", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-routine-proposal-required",
      userMessage:
        "Prima della gara perdo lucidità dopo un errore. Dammi una routine mentale pratica di 60 secondi.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
    };
    expect(streamInput.prepareStep).toEqual(expect.any(Function));

    const prepareStep = streamInput.prepareStep as NonNullable<
      typeof streamInput.prepareStep
    >;
    expect(prepareStep({ steps: [] })).toEqual({
      activeTools: ["proposeRoutine"],
      toolChoice: { type: "tool", toolName: "proposeRoutine" },
    });
    expect(
      prepareStep({
        steps: [{ toolCalls: [{ toolName: "proposeRoutine" }] }],
      }),
    ).toEqual({ activeTools: [], toolChoice: "none" });
  });

  it("keeps a dated personal routine request on the structured proposal path", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-dated-routine-proposal",
      userMessage: "Ho una gara domani, mi serve una routine mentale.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({ proposeRoutine: "routine-proposal-tool" }),
    );
    expect(streamInput.prepareStep?.({ steps: [] })).toEqual({
      activeTools: ["proposeRoutine"],
      toolChoice: { type: "tool", toolName: "proposeRoutine" },
    });
  });

  it("keeps the deterministic tomorrow-routine prompt off TinyFish", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-tomorrow-routine-proposal",
      userMessage:
        "Preparami una routine mentale pratica per la gara di domani",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
    };
    expect(streamInput.tools).toEqual({
      proposeRoutine: "routine-proposal-tool",
    });
    expect(streamInput.tools).not.toHaveProperty("tinyfishSearch");
    expect(streamInput.prepareStep?.({ steps: [] })).toEqual({
      activeTools: ["proposeRoutine"],
      toolChoice: { type: "tool", toolName: "proposeRoutine" },
    });
  });

  it("keeps routine proposals mandatory while deferring memory decisions", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-routine-memory-after-response",
      userMessage:
        "Ricordati che la domenica ho una gara. Dammi una routine mentale.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({ proposeRoutine: "routine-proposal-tool" }),
    );
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.instructions).toContain("POST-GENERATION MEMORY");
    expect(streamInput.prepareStep).toEqual(expect.any(Function));
    expect(streamInput.prepareStep?.({ steps: [] })).toEqual({
      activeTools: ["proposeRoutine"],
      toolChoice: { type: "tool", toolName: "proposeRoutine" },
    });
  });

  it("does not reactivate profile writes after a required routine proposal", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-routine-profile-post-generation",
      userMessage:
        "Mi chiamo Luca e gioco a tennis: dammi una routine mentale per la gara.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
    };
    expect(streamInput.prepareStep?.({ steps: [] })).toEqual({
      activeTools: ["proposeRoutine"],
      toolChoice: { type: "tool", toolName: "proposeRoutine" },
    });
    expect(
      streamInput.prepareStep?.({
        steps: [{ toolCalls: [{ toolName: "proposeRoutine" }] }],
      }),
    ).toEqual({ activeTools: [], toolChoice: "none" });
  });

  it.each([
    [
      "direct web-search requests",
      { userMessage: "Cerca online una routine per la pressione in gara." },
    ],
    [
      "benchmark model-comparison executions",
      {
        userMessage:
          "Dopo un errore in partita perdo fiducia: dammi una routine.",
        benchmarkModelId: "candidate/model",
      },
    ],
    [
      "voice turns",
      {
        userMessage:
          "Dopo un errore in partita perdo fiducia: dammi una routine.",
        responseMode: "voice" as const,
      },
    ],
    [
      "transcribed voice turns",
      {
        userMessage:
          "Dopo un errore in partita perdo fiducia: dammi una routine.",
        inputOrigin: "transcribed_voice" as const,
      },
    ],
    [
      "direct-media attachment turns",
      {
        userMessage:
          "Dopo un errore in partita perdo fiducia: dammi una routine.",
        messageParts: [
          {
            type: "file",
            data: "data:text/plain;base64,aGVsbG8=",
            mimeType: "text/plain",
          },
        ],
      },
    ],
    [
      "purely informational turns",
      { userMessage: "Quali sono le regole del tennis?" },
    ],
    [
      "overlapping informational coaching questions",
      {
        userMessage: "Qual è la differenza tra ansia e pressione in gara?",
      },
    ],
  ])("does not enable routine proposals for %s", async (_reason, options) => {
    await streamChat({
      userId: "user-1",
      chatId: `chat-routine-excluded-${_reason}`,
      ...options,
    });

    const streamInput = mocks.streamText.mock.calls.at(-1)?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).not.toHaveProperty("proposeRoutine");
  });

  it("enables TinyFish only for time-sensitive requests", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-news",
      userMessage: "Chi ha vinto la partita ieri?",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
    expect(streamInput.instructions).not.toContain("tinyfishFetch");
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updateProfile");
    expect(streamInput.tools).not.toHaveProperty("getMemories");
    expect(streamInput.tools).not.toHaveProperty("getUserContext");
    expect(streamInput.instructions).not.toContain("USER CONTEXT");
    expect(streamInput.instructions).not.toContain("USER MEMORIES");
    expect(mocks.formatUserContextForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createTinyfishTools).toHaveBeenCalledWith({
      maxSearchCalls: 1,
      maxSearchResults: 4,
      maxSearchSnippetChars: 180,
      maxFetchCalls: 1,
      maxFetchUrls: 3,
      defaultSearchDomainType: "news",
      defaultFetchPerUrlTimeoutMs: 8_000,
      defaultFetchTtl: 3600,
      fetchRequestTimeoutMs: 12_000,
      maxFetchTextChars: 2000,
    });
    expect(streamInput).toEqual(
      expect.objectContaining({ stopWhen: "stop-3" }),
    );
    expect(mocks.shouldUseRag).not.toHaveBeenCalled();
  });

  it("prefetches TinyFish directly for brief search-only requests", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-messi-brief",
      userMessage:
        "Fai una ricerca su internet: qual e la prossima partita che Messi giochera? Rispondi breve.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      prepareStep?: (input: {
        steps: Array<{ toolCalls?: unknown[] }>;
      }) => unknown;
      stopWhen: unknown;
      maxOutputTokens?: number;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({});
    expect(streamInput.instructions).toContain("WEB SEARCH RESULTS");
    expect(streamInput.instructions).toContain("Messi schedule");
    expect(streamInput.instructions).toContain("https://example.com/messi");
    expect(mocks.createTinyfishTools).not.toHaveBeenCalled();
    expect(mocks.searchTinyfishDirect).toHaveBeenCalledWith({
      query: "qual e la prossima partita che Messi giochera?",
      language: "it",
      defaultSearchDomainType: "news",
      maxSearchResults: 3,
      maxSearchSnippetChars: 160,
    });
    expect(mocks.getModelForUser).toHaveBeenCalledWith(
      undefined,
      undefined,
      "orchestrator",
      "BASIC",
      undefined,
      { parallelToolCalls: false },
    );
    expect(streamInput.maxOutputTokens).toBe(120);
    expect(mocks.isStepCount).toHaveBeenCalledWith(1);
    expect(streamInput.stopWhen).toBe("stop-1");
    expect(streamInput.prepareStep).toBeUndefined();
  });

  it("enables TinyFish for live score wording and explicit internet search requests", async () => {
    const prompts = [
      "che punteggio è la partita dei mondiali che sta giocando ora?",
      "fai una ricerca",
      "fai una ricerca su internet",
      "cercalo online per favore",
      "controlla sul web se è confermato",
      "verifica online gli ultimi aggiornamenti",
      "non riesco a cercare, puoi farlo tu?",
      "non ho trovato online, puoi controllare tu?",
      "qual è la classifica della Serie A oggi?",
      "ok, sai dirmi chi gioca per la norvegia sta sera",
      "qual è il meteo domani a Milano?",
      "quanto costa ora il biglietto per Inter Milan?",
      "è disponibile oggi la nuova maglia della nazionale?",
      "a che ora parte il treno per Roma stasera?",
      "ristoranti aperti ora vicino allo stadio",
      "ultime notizie sulla finale dei mondiali",
      "programma aggiornato degli eventi di questo weekend",
    ];

    for (const prompt of prompts) {
      mocks.streamText.mockClear();
      mocks.createTinyfishTools.mockClear();
      mocks.createMemoryTools.mockClear();
      mocks.createUserContextTools.mockClear();

      await streamChat({
        userId: "user-1",
        chatId: `chat-web-${prompt.length}`,
        userMessage: prompt,
      });

      const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
        instructions: string;
        tools: Record<string, unknown>;
      };
      expect(streamInput.instructions, prompt).toContain("WEB SEARCH");
      expect(streamInput.tools, prompt).toEqual(
        expect.objectContaining({
          tinyfishSearch: "tinyfish-tool",
        }),
      );
      expect(streamInput.tools, prompt).not.toHaveProperty("tinyfishFetch");
      expect(streamInput.tools, prompt).not.toHaveProperty("saveMemory");
      expect(streamInput.tools, prompt).not.toHaveProperty("updateProfile");
      expect(mocks.createTinyfishTools, prompt).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSearchCalls: 1,
          maxSearchResults: 4,
          maxSearchSnippetChars: 180,
          maxFetchCalls: 1,
          maxFetchUrls: 3,
          defaultFetchPerUrlTimeoutMs: 8_000,
          defaultFetchTtl: 3600,
          fetchRequestTimeoutMs: 12_000,
          maxFetchTextChars: 2000,
        }),
      );
    }
  });

  it("does not enable TinyFish for personal planning language with dates or ranking words", async () => {
    const prompts = [
      "fammi un programma di allenamento per il 2026",
      "classifica questi esercizi dal più facile al più difficile",
      "qual è il risultato del mio allenamento di ieri?",
      "analizza il mio ultimo microciclo senza cercare online",
      "non fare una ricerca, rispondi con quello che sai",
      "senza controllare online, secondo te cosa dovrei fare?",
      "non usare internet per questa risposta",
      "non serve cercare, voglio un consiglio rapido",
      "rispondi senza web: come gestisco l'ansia pre gara?",
      "programma per oggi una seduta leggera",
    ];

    for (const prompt of prompts) {
      mocks.streamText.mockClear();
      mocks.createTinyfishTools.mockClear();
      mocks.createMemoryTools.mockClear();
      mocks.createUserContextTools.mockClear();

      await streamChat({
        userId: "user-1",
        chatId: `chat-local-${prompt.length}`,
        userMessage: prompt,
      });

      const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
        instructions: string;
        tools: Record<string, unknown>;
      };
      expect(streamInput.instructions, prompt).not.toContain("WEB SEARCH");
      expect(streamInput.tools, prompt).not.toHaveProperty("tinyfishSearch");
      expect(streamInput.tools, prompt).not.toHaveProperty("tinyfishFetch");
      expect(mocks.createTinyfishTools, prompt).not.toHaveBeenCalled();
    }
  });

  it("repeats the Messi next-match chat with TinyFish available on the follow-up", async () => {
    mocks.buildConversationContext.mockResolvedValue([
      {
        role: "user",
        content:
          "vorrei sapere come è andata la partita dei mondiali di ieri, non quelle a gironi però",
      },
      {
        role: "assistant",
        content:
          "Ieri, domenica 28 giugno, è iniziata ufficialmente la fase a eliminazione diretta dei Mondiali 2026.",
      },
    ]);

    await streamChat({
      userId: "user-1",
      chatId: "chat-messi-next-match",
      userMessage: "quale è la prossima partita che messi giocherà?",
    });

    expect(mocks.buildConversationContext).toHaveBeenCalledWith(
      "user-1",
      4,
      "chat-messi-next-match",
    );

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      tools: Record<string, unknown>;
    };
    expect(streamInput.messages.at(-1)).toEqual({
      role: "user",
      content: "quale è la prossima partita che messi giocherà?",
    });
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updateProfile");
    expect(mocks.createTinyfishTools).toHaveBeenCalledWith({
      maxSearchCalls: 1,
      maxSearchResults: 4,
      maxSearchSnippetChars: 180,
      maxFetchCalls: 1,
      maxFetchUrls: 3,
      defaultSearchDomainType: "news",
      defaultFetchPerUrlTimeoutMs: 8_000,
      defaultFetchTtl: 3600,
      fetchRequestTimeoutMs: 12_000,
      maxFetchTextChars: 2000,
    });
  });

  it("enables TinyFish for guest time-sensitive requests without persistent tools", async () => {
    mocks.buildConversationContext.mockResolvedValue([]);

    await streamChat({
      userId: "guest-1",
      chatId: "chat-guest-news",
      userMessage:
        "il monza quest'anno a settembre dove giochera in quale categoria nel 2026?",
      isGuest: true,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      prepareStep?: unknown;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
    expect(streamInput.instructions).not.toContain("tinyfishFetch");
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updateProfile");
    expect(streamInput.tools).not.toHaveProperty("getMemories");
    expect(streamInput.tools).not.toHaveProperty("getUserContext");
    expect(mocks.createTinyfishTools).toHaveBeenCalledWith({
      maxSearchCalls: 1,
      maxSearchResults: 4,
      maxSearchSnippetChars: 180,
      maxFetchCalls: 1,
      maxFetchUrls: 3,
      defaultSearchDomainType: "news",
      defaultFetchPerUrlTimeoutMs: 8_000,
      defaultFetchTtl: 3600,
      fetchRequestTimeoutMs: 12_000,
      maxFetchTextChars: 2000,
    });
  });

  it("keeps TinyFish fetch available for source and article requests", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-web-source",
      userMessage: "Cerca online fonti affidabili e apri gli articoli sul tema",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      prepareStep?: unknown;
      tools: Record<string, unknown>;
    };
    expect(streamInput.instructions).toContain("tinyfishFetch");
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
        tinyfishFetch: "tinyfish-fetch-tool",
      }),
    );
    expect(mocks.isStepCount).toHaveBeenCalledWith(4);
    expect(streamInput.prepareStep).toBeUndefined();
    expect(streamInput).toEqual(
      expect.objectContaining({ stopWhen: "stop-4" }),
    );
  });

  it("exposes bounded RAG and web tools without prefetching in agentic mode", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({ rag: true });
    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-rag-web",
      userMessage:
        "Cerca online fonti affidabili e confrontale con i documenti caricati",
    });

    expect(mocks.classifyCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.getRagContext).not.toHaveBeenCalled();
    expect(mocks.searchTinyfishDirect).not.toHaveBeenCalled();
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      prepareStep: (input: {
        steps: Array<{
          toolCalls?: Array<{ toolName?: string }>;
          toolResults?: Array<{ toolName?: string; output?: unknown }>;
        }>;
      }) => unknown;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        searchRag: "rag-tool",
        tinyfishSearch: "tinyfish-tool",
        tinyfishFetch: "tinyfish-fetch-tool",
      }),
    );
    expect(streamInput.prepareStep({ steps: [] })).toEqual({
      activeTools: ["searchRag", "tinyfishSearch"],
      toolChoice: "auto",
    });
    expect(
      streamInput.prepareStep({
        steps: [
          {
            toolCalls: [{ toolName: "tinyfishSearch" }],
            toolResults: [
              {
                toolName: "tinyfishSearch",
                output: {
                  results: [{ url: "https://example.com/source" }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      activeTools: ["searchRag", "tinyfishFetch"],
      toolChoice: "auto",
    });
  });

  it("exposes guarded memory save and approval tools for an agentic write turn", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({ memoryWrite: true });

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-memory-write",
      conversationThreadId: "thread-1",
      userMessageId: "inbound-1",
      userMessage: "Di solito mi alleno il martedì e il giovedì.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({
      saveMemory: "memory-tool",
      requestMemoryApproval: "memory-approval-request-tool",
    });
    expect(mocks.createMemoryTools).toHaveBeenCalledWith("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    expect(streamInput.instructions).toContain("AUTONOMOUS MEMORY");
    expect(streamInput.instructions).not.toContain("Do not call `saveMemory`");
  });

  it("exposes approval resolution only for the server-attributed immediate follow-up", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    const pendingMemoryApproval = {
      id: "approval-1",
      userId: "user-1",
      sourceInboundMessageId: "inbound-source",
      key: "knee_injury",
      value: "Dolore al ginocchio",
      category: "health",
      confidence: 0.92,
      expiresAt: new Date("2026-08-09T18:15:00.000Z"),
    };

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-memory-approval",
      conversationThreadId: "thread-1",
      userMessageId: "inbound-current",
      userMessage: "Sì, salvalo in memoria.",
      pendingMemoryApproval,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({
      resolveMemoryApproval: "memory-approval-resolve-tool",
    });
    expect(mocks.createMemoryTools).toHaveBeenCalledWith("user-1", {
      pendingMemoryApproval,
      currentUserMessageId: "inbound-current",
    });
  });

  it("keeps brief web search as a native tool in agentic mode", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({
      webSearch: true,
      webFetch: false,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-brief-web",
      userMessage:
        "Fai una ricerca su internet: qual e la prossima partita che Messi giochera? Rispondi breve.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(mocks.searchTinyfishDirect).not.toHaveBeenCalled();
    expect(streamInput.instructions).not.toContain("WEB SEARCH RESULTS");
    expect(streamInput.tools).toEqual({ tinyfishSearch: "tinyfish-tool" });
  });

  it("records successfully injected native RAG context in turn metrics", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({ rag: true });

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-rag-metrics",
      userMessage: "Confronta con i documenti caricati",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      onStepEnd: (step: {
        toolCalls?: Array<{ toolName: string; input?: unknown }>;
        toolResults?: Array<{ output?: unknown }>;
        providerMetadata?: Record<string, unknown>;
      }) => void;
      onEnd: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };
    streamInput.onStepEnd({
      toolCalls: [{ toolName: "searchRag", input: { query: "documenti" } }],
      toolResults: [
        {
          output: {
            success: true,
            chunkCount: 2,
            context: "Contesto sicuro",
          },
        },
      ],
    });

    await streamInput.onEnd({
      text: "assistant response",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      providerMetadata: {},
    });

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-test",
      expect.any(Number),
      expect.objectContaining({
        ragUsed: true,
        ragChunksCount: 2,
      }),
    );
  });

  it("uses the immutable agentic turn plan for routine tool construction", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({
      routineProposal: true,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-routine-projection",
      userMessage: "Aiutami a ripartire dopo una gara difficile.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
      prepareStep?: (input: { steps: unknown[] }) => unknown;
    };
    expect(streamInput.tools).toEqual({
      proposeRoutine: "routine-proposal-tool",
    });
    expect(streamInput.prepareStep).toEqual(expect.any(Function));
    expect(streamInput.prepareStep?.({ steps: [] })).toBeUndefined();
  });

  it("composes agentic capabilities with legacy turn planning without divergence", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    vi.stubEnv("AI_TURN_PLANNER_MODE", "legacy");
    mocks.classifyCapabilities.mockResolvedValueOnce({
      rag: true,
      routineProposal: true,
    });
    const onFinish = vi.fn();

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-legacy-composition",
      userMessage:
        "Dimentica questa informazione, cerca online fonti e confrontale con i documenti caricati; poi dammi una routine pratica.",
      resolvedMemoryTarget: "training_goal",
      onFinish,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      prepareStep: (input: {
        steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
      }) => unknown;
      onEnd: (input: {
        text: string;
        usage: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
        };
        providerMetadata: Record<string, unknown>;
      }) => Promise<void>;
    };

    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        searchRag: "rag-tool",
        tinyfishSearch: "tinyfish-tool",
        tinyfishFetch: "tinyfish-fetch-tool",
        proposeRoutine: "routine-proposal-tool",
        deleteMemory: "memory-delete-tool",
      }),
    );
    expect(mocks.isStepCount).toHaveBeenCalledWith(5);
    expect(streamInput.prepareStep({ steps: [] })).toEqual({
      activeTools: [
        "searchRag",
        "tinyfishSearch",
        "deleteMemory",
        "proposeRoutine",
      ],
      toolChoice: "auto",
    });
    expect(
      streamInput.prepareStep({
        steps: [{ toolCalls: [{ toolName: "proposeRoutine" }] }],
      }),
    ).toEqual({
      activeTools: ["searchRag", "tinyfishSearch", "deleteMemory"],
      toolChoice: "auto",
    });
    expect(mocks.createMemoryTools).toHaveBeenCalledWith("user-1", {
      deleteTargetKey: "training_goal",
    });

    await streamInput.onEnd({
      text: "assistant response",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      providerMetadata: {},
    });

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        metrics: expect.objectContaining({
          turnPlan: expect.objectContaining({
            memoryDeleteTarget: "training_goal",
            capabilities: expect.objectContaining({
              webSearch: true,
              webFetch: true,
              rag: true,
              memoryDelete: true,
              routineProposal: true,
            }),
          }),
        }),
      }),
    );
  });

  it("does not expose memory deletion for a generic forget request", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-generic-forget",
      userMessage: "Dimentica quella informazione",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).not.toHaveProperty("deleteMemory");
  });

  it("runs agentic arbitration for forbidden web turns while preserving RAG", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({ rag: true });
    mocks.getRagContext.mockResolvedValueOnce({
      text: "**Documento allenamento**\\ncontenuto rilevante",
      chunkCount: 1,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-agentic-rag-no-web",
      userMessage:
        "Rispondi senza cercare online e confronta con i documenti caricati",
    });

    expect(mocks.classifyCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.getRagContext).not.toHaveBeenCalled();
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toHaveProperty("searchRag", "rag-tool");
    expect(streamInput.tools).not.toHaveProperty("tinyfishSearch");
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
  });

  it("uses the capability classifier boundary for ambiguous current-info requests", async () => {
    const abortController = new AbortController();
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce({
      webSearch: true,
      webFetch: false,
      rag: false,
      userContext: false,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-ambiguous-current-info",
      userMessage: "Mi aggiorni sulla situazione di Messi?",
      abortSignal: abortController.signal,
    });

    expect(mocks.classifyCapabilities).toHaveBeenCalledWith({
      userId: "user-1",
      userMessage: "Mi aggiorni sulla situazione di Messi?",
      modelId: "qwen/qwen3.6-27b",
      context: expect.stringContaining("ambiguous_current_info"),
      abortSignal: abortController.signal,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.instructions).toContain("WEB SEARCH");
    expect(streamInput.instructions).not.toContain("USER CONTEXT");
  });

  it("uses deterministic fallback when the capability classifier is unavailable", async () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockResolvedValueOnce(null);

    await streamChat({
      userId: "user-1",
      chatId: "chat-classifier-fallback",
      userMessage: "Mi aggiorni sulla situazione di Messi?",
    });

    expect(mocks.classifyCapabilities).toHaveBeenCalledTimes(1);
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual({});
  });

  it("propagates capability-classifier cancellation instead of falling back", async () => {
    const abortController = new AbortController();
    const abortError = new Error("request aborted");
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");
    mocks.classifyCapabilities.mockRejectedValueOnce(abortError);

    await expect(
      streamChat({
        userId: "user-1",
        chatId: "chat-aborted-classifier",
        userMessage: "Mi aggiorni sulla situazione di Messi?",
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError);

    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("builds audio/file content parts, strips codec suffixes, and applies voice-disabled prompt variant", async () => {
    mocks.buildConversationContext.mockResolvedValue([]);
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue({
      text: "**Doc A**\ncontext",
      chunkCount: 1,
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-2",
      userMessage: "voice message",
      hasAudio: true,
      voiceEnabled: false,
      messageParts: [
        {
          type: "file",
          data: VALID_WEBM_BYTES.toString("base64"),
          mimeType: "audio/webm;codecs=opus",
        },
      ],
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      instructions: string;
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
    expect(streamInput.instructions).toContain("**Doc A**");
    expect(streamInput.instructions).toContain("Voice generation is disabled");
  });

  it("skips invalid non-image file data instead of failing stream setup", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-file",
      userMessage: "leggi questo file",
      messageParts: [
        { type: "text", text: "leggi questo file" },
        {
          type: "file",
          data: "https://blob.example/file.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };

    expect(streamInput.messages).toEqual([
      { role: "user", content: "same message" },
      {
        role: "user",
        content: [{ type: "text", text: "leggi questo file" }],
      },
    ]);
  });

  it("adds voice-first response instructions when the response mode is voice", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-voice",
      userMessage: "Mandami un vocale",
      responseMode: "voice",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };

    expect(streamInput.instructions).toContain("VOICE RESPONSE MODE");
    expect(streamInput.instructions).toContain("spoken audio");
    expect(streamInput.instructions).toContain(
      "The generated text is the exact audio content the user will hear now",
    );
    expect(streamInput.instructions).toContain(
      "Never say that you will send, prepare, record, generate, or provide a voice note/audio later",
    );
    expect(streamInput.instructions).toContain(
      "ask directly what they want to hear",
    );
    expect(streamInput.instructions).toContain(
      "give a concise spoken summary and offer a separate written follow-up",
    );
    expect(streamInput.instructions).not.toContain(
      "say that you will keep it written instead",
    );
    expect(streamInput.instructions).toContain("Do not use markdown");
  });

  it("adds the exact fallback reason when an explicit voice request is unavailable", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-voice-fallback",
      userMessage: "Mandami un vocale",
      voiceEnabled: false,
      voiceUnavailableReason:
        "Voice is temporarily unavailable, so I'm replying in text.",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };

    expect(streamInput.instructions).toContain(
      'Begin with this exact sentence: "Voice is temporarily unavailable, so I\'m replying in text."',
    );
    expect(streamInput.instructions).toContain(
      "Do not promise that audio will follow.",
    );
    expect(streamInput.instructions).not.toContain("TEXT RESPONSE MODE");
  });

  it("continues streaming when memories are temporarily unavailable", async () => {
    mocks.formatMemoriesForPrompt.mockRejectedValue(
      new Error("memory table is out of sync"),
    );

    const result = await streamChat({
      userId: "user-1",
      chatId: "chat-2",
      userMessage: "same message",
    });

    expect(result).toEqual({ marker: "stream-result" });
    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("No user memories available.");
  });

  it("continues streaming with empty history when conversation history lookup fails", async () => {
    mocks.buildConversationContext.mockRejectedValue(
      new Error("messages table is temporarily unavailable"),
    );

    const result = await streamChat({
      userId: "user-1",
      chatId: "chat-history",
      userMessage: "continue anyway",
    });

    expect(result).toEqual({ marker: "stream-result" });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      instructions: string;
    };
    expect(streamInput.messages).toEqual([
      { role: "user", content: "continue anyway" },
    ]);
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
  });

  it("uses compact prompt and skips persistent tools for guest chats", async () => {
    await streamChat({
      userId: "guest-1",
      chatId: "chat-guest",
      userMessage: "ciao",
      isGuest: true,
      memoryEnabled: false,
    });

    expect(mocks.formatUserContextForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createMemoryTools).not.toHaveBeenCalled();
    expect(mocks.createUserContextTools).not.toHaveBeenCalled();
    expect(mocks.createTinyfishTools).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).not.toHaveBeenCalled();
    expect(mocks.shouldUseRag).not.toHaveBeenCalled();
    expect(mocks.getRagContext).not.toHaveBeenCalled();

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.instructions).toContain("GUEST SESSION");
    expect(streamInput.instructions).toContain("AI mental coach");
    expect(streamInput.instructions).toContain(
      "Never claim to be human, licensed, or a healthcare professional",
    );
    expect(streamInput.instructions).not.toContain(
      "NEVER say you are an AI or a model",
    );
    expect(streamInput.instructions).toContain(
      "Persistent profile, preferences, and memory are unavailable",
    );
    expect(streamInput.instructions).toContain("60 to 90 words");
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.tools).toEqual({});
    expect(streamInput.maxOutputTokens).toBe(220);
  });

  it("skips conversation history lookup when the caller knows this is the first message", async () => {
    await streamChat({
      userId: "guest-1",
      chatId: "chat-new",
      userMessage: "ciao",
      isGuest: true,
      memoryEnabled: false,
      skipConversationHistory: true,
    });

    expect(mocks.buildConversationContext).not.toHaveBeenCalled();

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(streamInput.messages).toEqual([{ role: "user", content: "ciao" }]);
  });

  it("collects step tool calls and forwards computed metrics through onFinish", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue({
      text: "**Doc A**\n...\n**Doc B**\n...",
      chunkCount: 2,
    });

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
      onStepEnd: (step: {
        text?: string;
        toolCalls?: Array<{ toolName: string; input?: unknown }>;
        toolResults?: Array<{ output?: unknown }>;
        providerMetadata?: Record<string, unknown>;
      }) => void;
      onEnd: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        totalUsage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };

    streamInput.onStepEnd({
      text: "partial",
      toolCalls: [
        {
          toolName: "saveMemory",
          input: { key: "health_condition", value: "Diagnosi privata" },
        },
      ],
      toolResults: [
        { output: { status: "approval_required", approvalId: "approval-1" } },
      ],
      providerMetadata: { openrouter: { usage: { cost: 0.04 } } },
    });
    streamInput.onStepEnd({
      text: "assistant response",
      providerMetadata: { openrouter: { usage: { cost: 0.11 } } },
    });

    expect(userOnStepFinish).toHaveBeenCalledWith({
      text: "partial",
      toolCalls: [{ name: "saveMemory", status: "completed" }],
      toolResults: [{ name: "saveMemory", status: "completed" }],
    });
    expect(userOnStepFinish).toHaveBeenCalledWith({
      text: "assistant response",
      toolCalls: undefined,
      toolResults: undefined,
    });

    await streamInput.onEnd({
      text: "assistant response",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      totalUsage: { inputTokens: 110, outputTokens: 120, totalTokens: 230 },
      providerMetadata: { openrouter: { usage: { promptTokens: 10 } } },
    });

    expect(mocks.extractAIMetrics).toHaveBeenCalledWith(
      "google/gemini-test",
      expect.any(Number),
      expect.objectContaining({
        text: "assistant response",
        usage: {
          promptTokens: 110,
          completionTokens: 120,
          totalTokens: 230,
        },
        preferProviderUsage: false,
        providerCostUsd: 0.15,
        ragUsed: true,
        ragChunksCount: 2,
        collectedToolCalls: [
          {
            name: "saveMemory",
            status: "completed",
          },
        ],
        toolTiming: {
          firstModelStepMs: expect.any(Number),
          toolExecutionMs: expect.any(Number),
          finalModelStepMs: expect.any(Number),
        },
      }),
    );
    expect(userOnFinish).toHaveBeenCalledWith({
      text: "assistant response",
      metrics: expect.objectContaining({
        model: "google/gemini-test",
        ragUsed: true,
        ragChunksCount: 2,
        tracePayload: expect.objectContaining({
          toolCalls: [{ name: "saveMemory", status: "completed" }],
        }),
      }),
    });
  });

  it("waits for async onFinish work before resolving the stream finish callback", async () => {
    const userOnFinish = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        }),
    );

    await streamChat({
      userId: "user-1",
      chatId: "chat-async-finish",
      userMessage: "hello",
      onFinish: userOnFinish,
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      onEnd: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
      }) => Promise<void>;
    };

    const finishPromise = streamInput.onEnd({
      text: "assistant response",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });

    await Promise.resolve();
    expect(userOnFinish).toHaveBeenCalledTimes(1);

    let resolved = false;
    finishPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(10);
    await finishPromise;
    expect(resolved).toBe(true);
  });
});
