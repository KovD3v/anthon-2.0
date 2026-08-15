import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  chatFindMany: vi.fn(),
  chatFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  routineFindMany: vi.fn(),
  modelExperimentPairFindMany: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  getVoicePlanConfig: vi.fn(),
}));

vi.mock("react", () => ({
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findMany: mocks.chatFindMany,
      findFirst: mocks.chatFindFirst,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      findMany: mocks.messageFindMany,
    },
    routine: {
      findMany: mocks.routineFindMany,
    },
    modelExperimentPair: {
      findMany: mocks.modelExperimentPairFindMany,
    },
  },
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

import { getSharedChat, getSharedChats, getSharedChatWithRetry } from "./chat";

const serverTraceFixture = {
  version: 1,
  status: "completed",
  totalMs: 10,
  timeToFirstTokenMs: 5,
  spans: [],
};
const clientTraceFixture = {
  version: 1,
  status: "partial",
  milestones: { requestStartedMs: 0 },
};

describe("lib/chat", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset();
    mocks.chatFindMany.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.routineFindMany.mockReset();
    mocks.routineFindMany.mockResolvedValue([]);
    mocks.modelExperimentPairFindMany.mockReset();
    mocks.modelExperimentPairFindMany.mockResolvedValue([]);
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.getVoicePlanConfig.mockReset();

    mocks.unstableCache.mockImplementation(
      (fn: (...args: unknown[]) => unknown) => fn,
    );
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
  });

  it("getSharedChats maps DB rows and uses user-scoped cache keys", async () => {
    mocks.chatFindMany.mockResolvedValue([
      {
        id: "chat-2",
        title: "Recent Chat",
        icon: "TROPHY",
        visibility: "PUBLIC",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T12:00:00.000Z"),
        _count: { messages: 3 },
      },
      {
        id: "chat-1",
        title: null,
        icon: "MESSAGE_SQUARE",
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-15T09:00:00.000Z"),
        updatedAt: new Date("2026-02-15T09:30:00.000Z"),
        _count: { messages: 0 },
      },
    ]);

    const result = await getSharedChats("user-1");

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["chats-user-1"],
      { tags: ["chats-user-1"], revalidate: 60 },
    );
    expect(mocks.chatFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
    expect(result).toEqual([
      {
        id: "chat-2",
        title: "Recent Chat",
        icon: "TROPHY",
        visibility: "PUBLIC",
        createdAt: "2026-02-16T10:00:00.000Z",
        updatedAt: "2026-02-16T12:00:00.000Z",
        messageCount: 3,
      },
      {
        id: "chat-1",
        title: "Nuova Chat",
        icon: "MESSAGE_SQUARE",
        visibility: "PRIVATE",
        createdAt: "2026-02-15T09:00:00.000Z",
        updatedAt: "2026-02-15T09:30:00.000Z",
        messageCount: 0,
      },
    ]);
  });

  it("getSharedChat returns null when chat is inaccessible", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue(null);

    const result = await getSharedChat("chat-missing", "user-1");

    expect(result).toBeNull();
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
  });

  it("keeps the default initial message window small for chat navigation", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-long",
      title: "Long chat",
      icon: "BRAIN",
      visibility: "PRIVATE",
      userId: "owner-1",
      createdAt: new Date("2026-02-14T12:00:00.000Z"),
      updatedAt: new Date("2026-02-17T12:00:00.000Z"),
      _count: { messages: 21 },
    });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.messageFindMany.mockResolvedValue([]);

    await getSharedChat("chat-long", "viewer-1");

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }),
    );
  });

  it("retries a newly-created chat after a transient read-after-write miss", async () => {
    vi.useFakeTimers();
    try {
      mocks.chatFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: "chat-new",
        title: null,
        icon: null,
        visibility: "PRIVATE",
        userId: "user-1",
        createdAt: new Date("2026-08-09T10:00:00.000Z"),
        updatedAt: new Date("2026-08-09T10:00:00.000Z"),
        routineContextMode: null,
        routineContextRoutine: null,
        _count: { messages: 0 },
      });
      mocks.userFindUnique.mockResolvedValue(null);

      const resultPromise = getSharedChatWithRetry("chat-new", "user-1");
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result?.id).toBe("chat-new");
      expect(mocks.chatFindFirst).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getSharedChat maps messages, usage, pagination, and entitlement-driven voice config", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: null,
      icon: "BRAIN",
      visibility: "PRIVATE",
      userId: "user-1",
      createdAt: new Date("2026-02-14T12:00:00.000Z"),
      updatedAt: new Date("2026-02-17T12:00:00.000Z"),
      _count: { messages: 3 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: false,
      preferences: { voiceEnabled: false, showTechnicalMetrics: true },
      subscription: { status: "ACTIVE", planId: "basic_plus" },
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      limits: {
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 10000,
        maxOutputTokensPerDay: 8000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      modelTier: "BASIC_PLUS",
      sources: [],
    });
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: false });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        clientMessageId: "client-turn-2",
        sourceInboundMessage: null,
        role: "USER",
        parts: [{ type: "text", text: "latest question" }],
        createdAt: new Date("2026-02-17T11:00:00.000Z"),
        model: "model-a",
        inputTokens: 42,
        outputTokens: null,
        costUsd: 0,
        generationTimeMs: 0,
        reasoningTimeMs: 0,
        ragUsed: false,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
      {
        id: "m2",
        clientMessageId: null,
        sourceInboundMessage: { clientMessageId: "client-turn-1" },
        role: "ASSISTANT",
        parts: [],
        createdAt: new Date("2026-02-17T10:59:00.000Z"),
        model: "candidate/model",
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: [{ type: "tool", name: "search" }],
        feedback: -1,
        metadata: {
          feedback: { reason: "wrong_fact" },
          modelComparisonPairId: "pair-1",
          voice: {
            category: "VOICE_REQUIRED",
            reasonCode: "PLAN_NOT_ELIGIBLE",
          },
        },
        attachments: [
          {
            id: "att-1",
            name: "doc.md",
            contentType: "text/markdown",
            size: 321,
            blobUrl: "https://blob.test/doc.md",
          },
          {
            id: "att-voice",
            name: "voice.mp3",
            contentType: "audio/mpeg",
            size: 456,
            blobUrl: "https://blob.test/private-conversation.mp3",
          },
        ],
      },
      {
        id: "m1",
        clientMessageId: "client-turn-1",
        sourceInboundMessage: null,
        role: "USER",
        parts: [],
        createdAt: new Date("2026-02-17T10:58:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-1", "user-1", undefined, 2);

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "user-1",
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "basic_plus",
      isGuest: false,
    });
    expect(mocks.getVoicePlanConfig).toHaveBeenCalledWith(
      "ACTIVE",
      "USER",
      "basic_plus",
      false,
      "BASIC_PLUS",
    );
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        clientMessageId: true,
        sourceInboundMessage: {
          select: { clientMessageId: true },
        },
        role: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        costUsd: true,
        generationTimeMs: true,
        reasoningTimeMs: true,
        ragUsed: true,
        ragChunksCount: true,
        toolCalls: true,
        metrics: {
          select: {
            model: true,
            provider: true,
            reasoningTokens: true,
            reasoningTimeMs: true,
            toolCallCount: true,
            toolResultChars: true,
            toolTiming: true,
            ragUsed: true,
            ragChunksCount: true,
            serverTrace: true,
            clientTrace: true,
            developerDiagnostics: true,
          },
        },
        feedback: true,
        metadata: true,
        voiceGenerationJob: {
          select: {
            status: true,
            errorCode: true,
          },
        },
        attachments: {
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        },
      },
    });

    expect(result).toMatchObject({
      id: "chat-1",
      title: "Nuova Chat",
      icon: "BRAIN",
      visibility: "PRIVATE",
      isOwner: true,
      pagination: {
        hasMore: true,
        nextCursor: "m2",
      },
      voiceEnabled: false,
      voicePlanEnabled: false,
    });
    expect(result?.messages.map((message) => message.id)).toEqual(["m2", "m3"]);
    expect(result?.messages[0]).toMatchObject({
      id: "m2",
      sourceClientMessageId: "client-turn-1",
      role: "assistant",
      feedback: -1,
      feedbackReason: "wrong_fact",
      voice: {
        isExplicitRequest: true,
        reasonCode: "PLAN_NOT_ELIGIBLE",
      },
      attachments: [
        {
          id: "att-1",
          name: "doc.md",
          blobUrl: "https://blob.test/doc.md",
        },
        {
          id: "att-voice",
          name: "voice.mp3",
          blobUrl: "/api/voice/messages/m2",
        },
      ],
    });
    expect(result?.messages[1]).toMatchObject({
      id: "m3",
      clientMessageId: "client-turn-2",
      role: "user",
      usage: {
        inputTokens: 42,
        outputTokens: 0,
        cost: 0,
        generationTimeMs: 0,
        reasoningTimeMs: 0,
      },
    });
  });

  it.each([
    {
      name: "a private USER without an override",
      role: "USER",
      preference: null,
      isGuest: false,
      visibility: "PRIVATE",
      isOwner: true,
      expected: false,
    },
    {
      name: "a private USER with an explicit override",
      role: "USER",
      preference: true,
      isGuest: false,
      visibility: "PRIVATE",
      isOwner: true,
      expected: true,
    },
    {
      name: "a private ADMIN without an override",
      role: "ADMIN",
      preference: null,
      isGuest: false,
      visibility: "PRIVATE",
      isOwner: true,
      expected: true,
    },
    {
      name: "a private SUPER_ADMIN without an override",
      role: "SUPER_ADMIN",
      preference: null,
      isGuest: false,
      visibility: "PRIVATE",
      isOwner: true,
      expected: true,
    },
    {
      name: "a guest owner",
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: true,
      visibility: "PRIVATE",
      isOwner: true,
      expected: false,
    },
    {
      name: "a public owner",
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: false,
      visibility: "PUBLIC",
      isOwner: true,
      expected: false,
    },
    {
      name: "a public non-owner",
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: false,
      visibility: "PUBLIC",
      isOwner: false,
      expected: false,
    },
  ] as const)("gates technical fields for $name", async (testCase) => {
    const viewerId = "viewer-1";
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Session",
      visibility: testCase.visibility,
      userId: testCase.isOwner ? viewerId : "owner-1",
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:00:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: testCase.role,
      isGuest: testCase.isGuest,
      preferences: {
        voiceEnabled: true,
        showTechnicalMetrics: testCase.preference,
      },
      subscription: null,
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-1",
        role: "ASSISTANT",
        parts: [{ type: "text", text: "Risposta" }],
        createdAt: new Date("2026-08-08T10:00:00.000Z"),
        model: "private-model",
        inputTokens: 11,
        outputTokens: 7,
        costUsd: 0.02,
        generationTimeMs: 120,
        reasoningTimeMs: 30,
        ragUsed: true,
        toolCalls: [
          {
            name: "saveMemory",
            args: { key: "health_condition", value: "Diagnosi privata" },
            result: { approvalId: "approval-1" },
          },
        ],
        metrics: {
          serverTrace: serverTraceFixture,
          clientTrace: clientTraceFixture,
        },
        feedback: null,
        metadata: { raw: "must-not-leak" },
        voiceGenerationJob: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-1", viewerId);
    const message = result?.messages[0];

    if (testCase.expected) {
      expect(message).toMatchObject({
        model: "private-model",
        usage: {
          inputTokens: 11,
          outputTokens: 7,
          cost: 0.02,
        },
        ragUsed: true,
        toolCalls: [{ name: "saveMemory", status: "completed" }],
      });
      if (testCase.role === "ADMIN" || testCase.role === "SUPER_ADMIN") {
        expect(message?.usage).toHaveProperty("messageId", "assistant-1");
      } else {
        expect(message?.usage).not.toHaveProperty("messageId");
      }
    } else {
      expect(message).not.toHaveProperty("model");
      expect(message).not.toHaveProperty("usage");
      expect(message).not.toHaveProperty("ragUsed");
      expect(message).not.toHaveProperty("toolCalls");
      expect(message).not.toHaveProperty("metadata");
    }
  });

  it("getSharedChat hydrates trusted routine cards for a private authenticated owner", async () => {
    const proposal = {
      title: "Reset dopo un errore",
      trigger: "Quando commetti un errore in gara",
      durationLabel: "60 secondi",
      steps: [
        "Fermati e guarda un punto",
        "Espira lentamente",
        "Scegli il prossimo gesto",
      ],
      completionCue: "Riparti sul compito successivo",
    };
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Routine",
      visibility: "PRIVATE",
      userId: "user-1",
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:05:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: false,
      preferences: null,
      subscription: null,
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-1",
        role: "ASSISTANT",
        parts: [
          { type: "text", text: "Prova questa routine." },
          { type: "data-coachingRoutine", data: proposal },
        ],
        createdAt: new Date("2026-08-08T10:05:00.000Z"),
        model: "model-a",
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: [{ name: "proposeRoutine", args: proposal }],
        feedback: null,
        metadata: { routineProposal: proposal },
        attachments: [],
      },
    ]);
    mocks.routineFindMany.mockResolvedValue([
      {
        id: "routine-1",
        formatVersion: 1,
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-1",
        status: "ACTIVE",
        title: proposal.title,
        trigger: proposal.trigger,
        durationLabel: proposal.durationLabel,
        steps: proposal.steps,
        completionCue: proposal.completionCue,
        archivedAt: null,
        attempts: [
          {
            id: "attempt-latest",
            attemptedAt: new Date("2026-08-08T11:00:00.000Z"),
            outcome: "HELPFUL",
            outcomeNote: "Mi ha rimesso a fuoco",
            outcomeRecordedAt: new Date("2026-08-08T11:01:00.000Z"),
          },
        ],
      },
    ]);

    const result = await getSharedChat("chat-1", "user-1");

    expect(mocks.routineFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: { in: ["assistant-1"] },
      },
      include: {
        attempts: { orderBy: { attemptedAt: "desc" }, take: 1 },
      },
    });
    expect(result?.messages[0]?.parts).toEqual([
      { type: "text", text: "Prova questa routine." },
      { type: "data-coachingRoutine", data: proposal },
    ]);
    expect(result?.routines).toEqual([
      {
        id: "routine-1",
        formatVersion: 1,
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-1",
        status: "ACTIVE",
        proposal,
        archivedAt: null,
        latestAttempt: {
          id: "attempt-latest",
          attemptedAt: "2026-08-08T11:00:00.000Z",
          outcome: "HELPFUL",
          outcomeNote: "Mi ha rimesso a fuoco",
          outcomeRecordedAt: "2026-08-08T11:01:00.000Z",
        },
      },
    ]);
  });

  it("getSharedChat hydrates an existing routine context for a repeat chat", async () => {
    const proposal = {
      title: "Reset già salvato",
      trigger: "Prima del gesto successivo",
      durationLabel: "60 secondi",
      steps: ["Espira", "Scegli il gesto"],
      completionCue: "Riparti sul compito",
    };
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-repeat",
      title: "Ripeti: Reset già salvato",
      icon: "REFRESH_CCW",
      visibility: "PRIVATE",
      userId: "user-1",
      routineContextMode: "REPEAT",
      routineContextRoutine: {
        id: "routine-existing",
        formatVersion: 1,
        sourceChatId: "source-chat",
        sourceAssistantMessageId: "source-assistant",
        status: "ACTIVE",
        title: proposal.title,
        trigger: proposal.trigger,
        durationLabel: proposal.durationLabel,
        steps: proposal.steps,
        completionCue: proposal.completionCue,
        archivedAt: null,
        attempts: [],
      },
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:05:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: false,
      preferences: { voiceEnabled: true, showTechnicalMetrics: false },
      subscription: null,
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-repeat",
        role: "ASSISTANT",
        parts: [{ type: "text", text: "Ripartiamo." }],
        createdAt: new Date("2026-08-08T10:05:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        feedback: null,
        metadata: null,
        voiceGenerationJob: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-repeat", "user-1");

    expect(result?.routineContext).toEqual({
      mode: "repeat",
      routine: {
        id: "routine-existing",
        formatVersion: 1,
        sourceChatId: "source-chat",
        sourceAssistantMessageId: "source-assistant",
        status: "ACTIVE",
        proposal,
        archivedAt: null,
        latestAttempt: null,
      },
    });
  });

  it("getSharedChat keeps proposals but not saved routine cards for a guest owner", async () => {
    const proposal = {
      title: "Reset rapido",
      trigger: "Prima del servizio",
      durationLabel: null,
      steps: ["Espira lentamente", "Guarda il bersaglio"],
      completionCue: "Inizia il movimento",
    };
    mocks.chatFindFirst.mockResolvedValue({
      id: "guest-chat",
      title: null,
      visibility: "PRIVATE",
      userId: "guest-1",
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:05:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: true,
      preferences: null,
      subscription: null,
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-guest",
        role: "ASSISTANT",
        parts: [{ type: "data-coachingRoutine", data: proposal }],
        createdAt: new Date("2026-08-08T10:05:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("guest-chat", "guest-1");

    expect(result?.messages[0]?.parts).toEqual([
      { type: "data-coachingRoutine", data: proposal },
    ]);
    expect(result?.routines).toEqual([]);
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it("getSharedChat strips private coaching data from a public non-owner payload", async () => {
    const proposal = {
      title: "Routine privata",
      trigger: "Quando sale la tensione",
      durationLabel: "45 secondi",
      steps: ["Respira", "Scegli un gesto"],
      completionCue: "Torna al presente",
    };
    mocks.chatFindFirst.mockResolvedValue({
      id: "public-chat",
      title: "Public",
      visibility: "PUBLIC",
      userId: "owner-1",
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:05:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: false,
      preferences: null,
      subscription: null,
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-public",
        role: "ASSISTANT",
        parts: [
          { type: "text", text: "Testo condivisibile" },
          { type: "data-coachingRoutine", data: proposal },
        ],
        createdAt: new Date("2026-08-08T10:05:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: [{ name: "proposeRoutine", args: proposal }],
        feedback: null,
        metadata: { routineProposal: proposal },
        attachments: [],
      },
    ]);

    const result = await getSharedChat("public-chat", "viewer-1");

    expect(result?.routines).toEqual([]);
    expect(result?.messages[0]?.parts).toEqual([
      { type: "text", text: "Testo condivisibile" },
    ]);
    expect(result?.messages[0]).not.toHaveProperty("toolCalls");
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      "object",
      {
        type: "data-coachingRoutine",
        data: {
          title: "Routine privata",
          trigger: "Quando sale la tensione",
          steps: ["Respira", "Scegli un gesto"],
          completionCue: "Torna al presente",
        },
      },
    ],
    ["null", null],
  ])(
    "getSharedChat fails closed for malformed %s parts in a public payload",
    async (_label, parts) => {
      mocks.chatFindFirst.mockResolvedValue({
        id: "public-chat",
        title: "Public",
        visibility: "PUBLIC",
        userId: "owner-1",
        createdAt: new Date("2026-08-08T10:00:00.000Z"),
        updatedAt: new Date("2026-08-08T10:05:00.000Z"),
        _count: { messages: 1 },
      });
      mocks.userFindUnique.mockResolvedValue(null);
      mocks.messageFindMany.mockResolvedValue([
        {
          id: "assistant-malformed",
          role: "ASSISTANT",
          parts,
          createdAt: new Date("2026-08-08T10:05:00.000Z"),
          model: null,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          generationTimeMs: null,
          reasoningTimeMs: null,
          ragUsed: null,
          toolCalls: null,
          feedback: null,
          metadata: null,
          attachments: [],
        },
      ]);

      const result = await getSharedChat("public-chat", "viewer-1");

      expect(result?.messages[0]?.parts).toEqual([]);
      expect(result?.routines).toEqual([]);
    },
  );

  it("getSharedChat supports cursor pagination and defaults voice preference for missing user data", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-public",
      title: "Public",
      visibility: "PUBLIC",
      userId: "owner-1",
      createdAt: new Date("2026-02-10T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:00:00.000Z"),
      _count: { messages: 1 },
    });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        role: "ASSISTANT",
        content: "hello",
        parts: [],
        createdAt: new Date("2026-02-11T10:00:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-public", "viewer-1", "msg-9", 50);

    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        cursor: { id: "msg-9" },
        skip: 1,
      }),
    );
    expect(result).toMatchObject({
      id: "chat-public",
      isOwner: false,
      voiceEnabled: true,
      voicePlanEnabled: true,
      pagination: {
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it("getSharedChat fast-paths empty guest chats without message or entitlement queries", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "guest-chat",
      title: null,
      visibility: "PRIVATE",
      userId: "guest-1",
      createdAt: new Date("2026-02-18T09:00:00.000Z"),
      updatedAt: new Date("2026-02-18T09:00:00.000Z"),
      _count: { messages: 0 },
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: true,
      preferences: null,
      subscription: null,
    });

    const result = await getSharedChat("guest-chat", "guest-1");

    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).not.toHaveBeenCalled();
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.chatFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          messages: { take: 1, select: { id: true } },
        }),
      }),
    );
    expect(result).toMatchObject({
      id: "guest-chat",
      title: "Nuova Chat",
      isOwner: true,
      messages: [],
      pagination: {
        hasMore: false,
        nextCursor: null,
      },
      voiceEnabled: true,
      voicePlanEnabled: false,
    });
  });
});
