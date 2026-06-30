import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTracing: vi.fn(),
  stepCountIs: vi.fn(),
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
  createUserContextTools: vi.fn(),
  formatTinyUserSnapshotForPrompt: vi.fn(),
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
  getModelById: mocks.getModelById,
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

vi.mock("@/lib/ai/tools/tinyfish", () => ({
  createTinyfishTools: mocks.createTinyfishTools,
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
    mocks.getModelById.mockReset();
    mocks.getModelIdForPlan.mockReset();
    mocks.getRagContext.mockReset();
    mocks.shouldUseRag.mockReset();
    mocks.buildConversationContext.mockReset();
    mocks.createMemoryTools.mockReset();
    mocks.formatMemoriesForPrompt.mockReset();
    mocks.createTinyfishTools.mockReset();
    mocks.createUserContextTools.mockReset();
    mocks.formatTinyUserSnapshotForPrompt.mockReset();
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
    mocks.getModelById.mockReturnValue("candidate-model");
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
      system: string;
    };
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("user-memories-data");
    expect(streamInput.system).not.toContain("SAVING DATA");
    expect(streamInput.system).not.toContain("TOOL POLICY");
    expect(streamInput.system).not.toContain("RAG CONTEXT");
    expect(countOccurrences(streamInput.system, "user-context-data")).toBe(1);
    expect(countOccurrences(streamInput.system, "user-memories-data")).toBe(1);
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
      system: string;
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
    expect(streamInput.system).toContain("Reply in the user's language");
    expect(streamInput.system).toContain("USER SNAPSHOT");
    expect(streamInput.system).toContain("Sport: tennis");
    expect(streamInput.system).toContain("Obiettivo: focus pre-gara");
    expect(streamInput.system).not.toContain("SAVING DATA");
    expect(streamInput.system).not.toContain("WEB SEARCH");
    expect(streamInput.system).not.toContain("RAG CONTEXT");
    expect(streamInput.system).not.toContain("USER CONTEXT");
    expect(streamInput.system).not.toContain("USER MEMORIES");
    expect(streamInput.system).not.toContain("user-context-data");
    expect(streamInput.system).not.toContain("user-memories-data");
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
      system: string;
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
    expect(streamInput.system).toContain("SAVING DATA");
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("user-memories-data");
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
      system: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.tools).toEqual({});
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("user-memories-data");
    expect(streamInput.system).not.toContain("SAVING DATA");
    expect(streamInput.system).not.toContain("TOOL POLICY");
    expect(streamInput.maxOutputTokens).toBeUndefined();
  });

  it("keeps RAG classification for simple wording that references documents", async () => {
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.getRagContext.mockResolvedValue("**Doc A**\ncontext");

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
      system: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.system).toContain("RAG CONTEXT");
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
        system: string;
        tools: Record<string, unknown>;
        maxOutputTokens?: number;
      };
      expect(streamInput.system, prompt).toContain("USER SNAPSHOT");
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
        system: string;
        tools: Record<string, unknown>;
        maxOutputTokens?: number;
      };
      if (promptCase.web) {
        expect(streamInput.system, promptCase.text).toContain("WEB SEARCH");
        expect(streamInput.system, promptCase.text).not.toContain(
          "USER CONTEXT",
        );
        expect(streamInput.system, promptCase.text).not.toContain(
          "user-context-data",
        );
      } else {
        expect(streamInput.system, promptCase.text).toContain(
          "user-context-data",
        );
      }
      if (promptCase.writes) {
        expect(streamInput.system, promptCase.text).toContain("SAVING DATA");
        expect(streamInput.tools, promptCase.text).not.toEqual({});
      } else {
        expect(streamInput.system, promptCase.text).not.toContain(
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
      onFinish?: (input: {
        text: string;
        usage?: { inputTokens?: number; outputTokens?: number };
        providerMetadata?: Record<string, unknown>;
      }) => Promise<void>;
    };
    await streamInput.onFinish?.({
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

  it("routes image messages to the multimodal orchestrator model", async () => {
    await streamChat({
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

    expect(mocks.getModelById).toHaveBeenCalledWith(
      "moonshotai/kimi-k2.7-code",
    );
    expect(mocks.getModelForUser).not.toHaveBeenCalled();
    expect(mocks.getModelIdForPlan).not.toHaveBeenCalled();
    expect(mocks.withTracing).toHaveBeenCalledWith(
      "candidate-model",
      "posthog-client",
      expect.objectContaining({
        posthogProperties: expect.objectContaining({
          modelId: "moonshotai/kimi-k2.7-code",
        }),
      }),
    );

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
      providerOptions: {
        openrouter: {
          models?: string[];
        };
      };
    };
    expect(streamInput.messages).toEqual([
      { role: "user", content: "same message" },
      {
        role: "user",
        content: [
          { type: "text", text: "cosa vedi?" },
          {
            type: "image",
            image:
              "https://blob.example/attachments/user-1/chat-image/photo.jpg",
          },
        ],
      },
    ]);
    expect(streamInput.providerOptions.openrouter.models).toBeUndefined();
  });

  it("enables TinyFish only for time-sensitive requests", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-news",
      userMessage: "Chi ha vinto la partita ieri?",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      system: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
    expect(streamInput.system).not.toContain("tinyfishFetch");
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updateProfile");
    expect(streamInput.tools).not.toHaveProperty("getMemories");
    expect(streamInput.tools).not.toHaveProperty("getUserContext");
    expect(streamInput.system).not.toContain("USER CONTEXT");
    expect(streamInput.system).not.toContain("USER MEMORIES");
    expect(mocks.formatUserContextForPrompt).not.toHaveBeenCalled();
    expect(mocks.formatMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createTinyfishTools).toHaveBeenCalledWith({
      maxSearchCalls: 1,
      maxFetchCalls: 1,
      maxFetchUrls: 3,
    });
    expect(mocks.shouldUseRag).not.toHaveBeenCalled();
  });

  it("enables TinyFish for live score wording and explicit internet search requests", async () => {
    const prompts = [
      "che punteggio è la partita dei mondiali che sta giocando ora?",
      "fai una ricerca su internet",
      "qual è la classifica della Serie A oggi?",
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
        system: string;
        tools: Record<string, unknown>;
      };
      expect(streamInput.system, prompt).toContain("WEB SEARCH");
      expect(streamInput.tools, prompt).toEqual(
        expect.objectContaining({
          tinyfishSearch: "tinyfish-tool",
        }),
      );
      expect(streamInput.tools, prompt).not.toHaveProperty("tinyfishFetch");
      expect(streamInput.tools, prompt).not.toHaveProperty("saveMemory");
      expect(streamInput.tools, prompt).not.toHaveProperty("updateProfile");
      expect(mocks.createTinyfishTools, prompt).toHaveBeenCalledWith({
        maxSearchCalls: 1,
        maxFetchCalls: 1,
        maxFetchUrls: 3,
      });
    }
  });

  it("does not enable TinyFish for personal planning language with dates or ranking words", async () => {
    const prompts = [
      "fammi un programma di allenamento per il 2026",
      "classifica questi esercizi dal più facile al più difficile",
      "qual è il risultato del mio allenamento di ieri?",
      "analizza il mio ultimo microciclo senza cercare online",
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
        system: string;
        tools: Record<string, unknown>;
      };
      expect(streamInput.system, prompt).not.toContain("WEB SEARCH");
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
      maxFetchCalls: 1,
      maxFetchUrls: 3,
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
      system: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
      }),
    );
    expect(streamInput.tools).not.toHaveProperty("tinyfishFetch");
    expect(streamInput.system).not.toContain("tinyfishFetch");
    expect(streamInput.tools).not.toHaveProperty("saveMemory");
    expect(streamInput.tools).not.toHaveProperty("updateProfile");
    expect(streamInput.tools).not.toHaveProperty("getMemories");
    expect(streamInput.tools).not.toHaveProperty("getUserContext");
    expect(mocks.createTinyfishTools).toHaveBeenCalledWith({
      maxSearchCalls: 1,
      maxFetchCalls: 1,
      maxFetchUrls: 3,
    });
  });

  it("keeps TinyFish fetch available for source and article requests", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-web-source",
      userMessage: "Cerca online fonti affidabili e apri gli articoli sul tema",
    });

    const streamInput = mocks.streamText.mock.calls[0]?.[0] as {
      system: string;
      tools: Record<string, unknown>;
    };
    expect(streamInput.system).toContain("tinyfishFetch");
    expect(streamInput.tools).toEqual(
      expect.objectContaining({
        tinyfishSearch: "tinyfish-tool",
        tinyfishFetch: "tinyfish-fetch-tool",
      }),
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

  it("skips invalid non-image file data instead of failing stream setup", async () => {
    await streamChat({
      userId: "user-1",
      chatId: "chat-file",
      userMessage: "leggi questo file",
      messageParts: [
        { type: "text", text: "leggi questo file" },
        {
          type: "file",
          data: "https://blob.example/file.pdf",
          mimeType: "application/pdf",
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
      system: string;
    };

    expect(streamInput.system).toContain("VOICE RESPONSE MODE");
    expect(streamInput.system).toContain("spoken audio");
    expect(streamInput.system).toContain("Do not use markdown");
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
      system: string;
    };
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("No user memories available.");
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
      system: string;
    };
    expect(streamInput.messages).toEqual([
      { role: "user", content: "continue anyway" },
    ]);
    expect(streamInput.system).toContain("user-context-data");
    expect(streamInput.system).toContain("user-memories-data");
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
      system: string;
      tools: Record<string, unknown>;
      maxOutputTokens?: number;
    };
    expect(streamInput.system).toContain("GUEST SESSION");
    expect(streamInput.system).toContain(
      "Persistent profile, preferences, and memory are unavailable",
    );
    expect(streamInput.system).toContain("60 to 90 words");
    expect(streamInput.system).not.toContain("SAVING DATA");
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
        toolCalls?: Array<{ toolName: string; input?: unknown }>;
        toolResults?: Array<{ output?: unknown }>;
        providerMetadata?: Record<string, unknown>;
      }) => void;
      onFinish: (step: {
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

    streamInput.onStepFinish({
      text: "partial",
      toolCalls: [{ toolName: "saveMemory", input: { key: "user_goal" } }],
      toolResults: [{ output: { saved: true } }],
      providerMetadata: { openrouter: { usage: { cost: 0.04 } } },
    });
    streamInput.onStepFinish({
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

    await streamInput.onFinish({
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
      onFinish: (step: {
        text: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
      }) => Promise<void>;
    };

    const finishPromise = streamInput.onFinish({
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
