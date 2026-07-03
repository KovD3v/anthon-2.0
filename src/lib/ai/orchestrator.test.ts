import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTracing: vi.fn(),
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
  createMemoryTools: vi.fn(),
  formatMemoriesForPrompt: vi.fn(),
  createTinyfishTools: vi.fn(),
  searchTinyfishDirect: vi.fn(),
  createUserContextTools: vi.fn(),
  formatTinyUserSnapshotForPrompt: vi.fn(),
  formatUserContextForPrompt: vi.fn(),
  measure: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  getPostHogClient: vi.fn(),
  getVoicePlanConfig: vi.fn(),
  openrouter: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("@posthog/ai", () => ({
  withTracing: mocks.withTracing,
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

vi.mock("@/lib/ai/tools/memory", () => ({
  createMemoryTools: mocks.createMemoryTools,
  formatMemoriesForPrompt: mocks.formatMemoriesForPrompt,
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

vi.mock("@/lib/posthog", () => ({
  getPostHogClient: mocks.getPostHogClient,
}));

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

import { streamChat } from "./orchestrator";

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
  modelTier: "BASIC",
  sources: [],
};

describe("ai/orchestrator", () => {
  beforeEach(() => {
    mocks.withTracing.mockReset();
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
    mocks.createMemoryTools.mockReset();
    mocks.formatMemoriesForPrompt.mockReset();
    mocks.createTinyfishTools.mockReset();
    mocks.searchTinyfishDirect.mockReset();
    mocks.createUserContextTools.mockReset();
    mocks.formatTinyUserSnapshotForPrompt.mockReset();
    mocks.formatUserContextForPrompt.mockReset();
    mocks.measure.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.getPostHogClient.mockReset();
    mocks.getVoicePlanConfig.mockReset();
    mocks.openrouter.mockReset();
    mocks.trackSupportAiUsage.mockReset();

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
    mocks.getPostHogClient.mockReturnValue("posthog-client");
    mocks.openrouter.mockImplementation((modelId: string) => ({
      modelId,
      provider: "openrouter",
    }));
    mocks.withTracing.mockReturnValue("traced-model");
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
    mocks.formatUserContextForPrompt.mockResolvedValue("user-context-data");
    mocks.formatMemoriesForPrompt.mockResolvedValue("user-memories-data");
    mocks.createMemoryTools.mockReturnValue({
      getMemories: "memory-read-tool",
      saveMemory: "memory-tool",
      deleteMemory: "memory-delete-tool",
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
        tools: {},
      }),
    );

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
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

  it("uses compact prompt and no tools for simple authenticated coaching messages", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-simple-fast",
      userMessage: "Dammi una risposta breve: motivami prima dell'allenamento",
    });

    expect(mocks.shouldUseRag).not.toHaveBeenCalled();
    expect(mocks.buildConversationContext).not.toHaveBeenCalled();
    expect(mocks.formatTinyUserSnapshotForPrompt).toHaveBeenCalledWith(
      "user-1",
    );
    expect(mocks.formatUserContextForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createMemoryTools).not.toHaveBeenCalled();
    expect(mocks.createUserContextTools).not.toHaveBeenCalled();
    expect(mocks.createTinyfishTools).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).not.toHaveBeenCalled();

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
        content: "Dammi una risposta breve: motivami prima dell'allenamento",
      },
    ]);
    expect(streamInput.maxOutputTokens).toBe(180);
    expect(streamInput.instructions).toContain("Reply in the user's language");
    expect(streamInput.instructions).toContain("USER SNAPSHOT");
    expect(streamInput.instructions).toContain("Sport: tennis");
    expect(streamInput.instructions).toContain("Obiettivo: focus pre-gara");
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.instructions).not.toContain("WEB SEARCH");
    expect(streamInput.instructions).not.toContain("RAG CONTEXT");
    expect(streamInput.instructions).not.toContain("USER CONTEXT");
    expect(streamInput.instructions).not.toContain("USER MEMORIES");
    expect(streamInput.instructions).not.toContain("user-context-data");
    expect(streamInput.instructions).not.toContain("user-memories-data");
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
    expect(streamInput.instructions).toContain("SAVING DATA");
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

  it("keeps complex coaching on full prompt without exposing persistent tools", async () => {
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
    expect(streamInput.tools).toEqual({});
    expect(streamInput.instructions).toContain("user-context-data");
    expect(streamInput.instructions).toContain("user-memories-data");
    expect(streamInput.instructions).not.toContain("SAVING DATA");
    expect(streamInput.instructions).not.toContain("TOOL POLICY");
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

  it("routes a compact quality prompt suite without sending complex requests to simple fast mode", async () => {
    const fastPrompts = [
      "Ciao",
      "Motivami prima dell'allenamento",
      "Dammi una risposta breve: focus prima della partita",
      "Caricami in poche parole",
      "Consiglio veloce per restare concentrato",
      "Reset mentale rapido",
      "Una frase breve per non mollare",
      "Ehi, dammi una spinta",
      "Tranquillizzami prima della gara",
      "Grazie, risposta breve",
    ];

    const fullPrompts = [
      { text: "Mi chiamo Luca e gioco a tennis", writes: true },
      { text: "Ricordati che domenica ho una partita", writes: true },
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
      expect(streamInput.maxOutputTokens, prompt).toBe(180);
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
          "SAVING DATA",
        );
        expect(streamInput.tools, promptCase.text).not.toEqual({});
      } else {
        expect(streamInput.instructions, promptCase.text).not.toContain(
          "SAVING DATA",
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
    expect(mocks.withTracing).toHaveBeenCalledWith(
      "candidate-model",
      "posthog-client",
      expect.objectContaining({
        posthogProperties: expect.objectContaining({
          modelId: "candidate/model",
        }),
      }),
    );

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
  });

  it("routes image messages through OpenRouter REST with image_url content", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const fetchSpy = vi.fn().mockResolvedValue(
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
        messageParts: [
          { type: "text", text: "cosa vedi?" },
          {
            type: "file",
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
    expect(mocks.withTracing).toHaveBeenCalledWith(
      "candidate-model",
      "posthog-client",
      expect.objectContaining({
        posthogProperties: expect.objectContaining({
          modelId: "google/gemini-2.5-flash-lite",
        }),
      }),
    );
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
      }),
    );

    const requestBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as { body: string }).body,
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
              url: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
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
  });

  it("reads OpenRouter image text from array content parts", async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const fetchSpy = vi.fn().mockResolvedValue(
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
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
      vi.fn().mockResolvedValue(
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
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
      vi.fn().mockResolvedValue(
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
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
          vi.fn().mockResolvedValue(Response.json(payload, { status })),
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
              data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
              mimeType: "image/jpeg",
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
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
      vi.fn().mockResolvedValue(
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
            data: "https://blob.example/attachments/user-1/chat-image/photo.jpg",
            mimeType: "image/jpeg",
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
      if (url === "https://blob.example/attachments/user-1/chat-pdf/doc.pdf") {
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
            data: "https://blob.example/attachments/user-1/chat-pdf/doc.pdf",
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
      "https://blob.example/attachments/user-1/chat-pdf/doc.pdf",
    );
    expect(mocks.streamText).not.toHaveBeenCalled();

    const openRouterCall = fetchSpy.mock.calls.find(
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
    const videoBytes = Buffer.from("video-bytes");
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url === "https://blob.example/attachments/user-1/chat-video/clip.mp4"
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
            data: "https://blob.example/attachments/user-1/chat-video/clip.mp4",
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
    const openRouterCall = fetchSpy.mock.calls.find(
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
          data: "https://blob.example/attachments/user-1/chat-video/clip.mp4",
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
      "https://blob.example/attachments/user-1/chat-video/clip.mp4",
    );
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

  it("uses the prompt classifier for ambiguous current-info requests", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: {
        webSearch: "yes",
        webFetch: "no",
        rag: "no",
        userContext: "not_needed",
        confidence: 0.86,
        reason: "asks for a current sports-person status update",
      },
      usage: {
        inputTokens: 22,
        outputTokens: 12,
        totalTokens: 34,
      },
      providerMetadata: {
        openrouter: {
          cost: 0.00002,
        },
      },
    });

    await streamChat({
      userId: "user-1",
      chatId: "chat-ambiguous-current-info",
      userMessage: "Mi aggiorni sulla situazione di Messi?",
    });

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: {
          modelId: "qwen/qwen3.6-27b",
          provider: "openrouter",
        },
        providerOptions: {
          openrouter: {
            provider: { sort: "latency" },
          },
        },
        temperature: 0,
        maxOutputTokens: 120,
      }),
    );
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "qwen/qwen3.6-27b",
      usage: {
        inputTokens: 22,
        outputTokens: 12,
        totalTokens: 34,
      },
      providerMetadata: {
        openrouter: {
          cost: 0.00002,
        },
      },
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
          data: Buffer.from("abc").toString("base64"),
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
      userMessage: "Mi serve un reset mentale prima della partita",
      responseMode: "voice",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      instructions: string;
    };

    expect(streamInput.instructions).toContain("VOICE RESPONSE MODE");
    expect(streamInput.instructions).toContain("spoken audio");
    expect(streamInput.instructions).toContain("Do not use markdown");
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
      toolCalls: [{ toolName: "saveMemory", input: { key: "user_goal" } }],
      toolResults: [{ output: { saved: true } }],
      providerMetadata: { openrouter: { usage: { cost: 0.04 } } },
    });
    streamInput.onStepEnd({
      text: "assistant response",
      providerMetadata: { openrouter: { usage: { cost: 0.11 } } },
    });

    expect(userOnStepFinish).toHaveBeenCalledWith({
      text: "partial",
      toolCalls: [{ toolName: "saveMemory", input: { key: "user_goal" } }],
      toolResults: [{ output: { saved: true } }],
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
            args: { key: "user_goal" },
            result: { saved: true },
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
