import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  generateChatMetadata: vi.fn(),
  getAuthUser: vi.fn(),
  chatFindFirst: vi.fn(),
  chatUpdate: vi.fn(),
  chatDelete: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  routineFindMany: vi.fn(),
  deletePrivateVoiceBlobsForMessages: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/ai/chat-title", () => ({
  generateChatMetadata: mocks.generateChatMetadata,
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findFirst: mocks.chatFindFirst,
      update: mocks.chatUpdate,
      delete: mocks.chatDelete,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
    },
    routine: {
      findMany: mocks.routineFindMany,
    },
  },
}));

vi.mock("@/lib/voice/attachment-cleanup", () => ({
  deletePrivateVoiceBlobsForMessages: mocks.deletePrivateVoiceBlobsForMessages,
}));

import { DELETE, GET, PATCH } from "./route";

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

function params(id = "chat-1"): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

describe("/api/chats/[id] route", () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset();
    mocks.generateChatMetadata.mockReset();
    mocks.getAuthUser.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.chatDelete.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.routineFindMany.mockReset();
    mocks.routineFindMany.mockResolvedValue([]);
    mocks.deletePrivateVoiceBlobsForMessages.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "SUPER_ADMIN", isGuest: false },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "SUPER_ADMIN",
      isGuest: false,
      preferences: { showTechnicalMetrics: true },
    });

    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "My Chat",
      icon: "BRAIN",
      visibility: "PRIVATE",
      userId: "user-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      updatedAt: new Date("2026-02-16T11:00:00.000Z"),
    });

    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        clientMessageId: null,
        sourceInboundMessage: { clientMessageId: "client-turn-1" },
        role: "ASSISTANT",
        content: "third",
        parts: [{ type: "text", text: "third" }],
        createdAt: new Date("2026-02-16T11:00:03.000Z"),
        model: "gpt-4o-mini",
        inputTokens: 10,
        outputTokens: 12,
        costUsd: 0.01,
        generationTimeMs: 230,
        reasoningTimeMs: 22,
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
        feedback: -1,
        metadata: { feedback: { reason: "too_generic" } },
        attachments: [
          {
            id: "att-1",
            name: "file.txt",
            contentType: "text/plain",
            size: 10,
            blobUrl: "https://example.com/file.txt",
          },
        ],
      },
      {
        id: "m2",
        clientMessageId: "client-turn-1",
        sourceInboundMessage: null,
        role: "USER",
        content: "second",
        parts: [{ type: "text", text: "second" }],
        createdAt: new Date("2026-02-16T11:00:02.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: false,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
      {
        id: "m1",
        role: "USER",
        content: "first",
        parts: [{ type: "text", text: "first" }],
        createdAt: new Date("2026-02-16T11:00:01.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: false,
        toolCalls: null,
        feedback: null,
        metadata: null,
        attachments: [],
      },
    ]);

    mocks.messageFindFirst.mockResolvedValue({
      parts: [{ type: "text", text: "How do I test this route?" }],
    });
    mocks.generateChatMetadata.mockResolvedValue({
      title: "Generated Title",
      icon: "TARGET",
    });
    mocks.chatUpdate.mockResolvedValue({
      id: "chat-1",
      title: "Generated Title",
      icon: "TARGET",
      visibility: "PUBLIC",
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });
    mocks.chatDelete.mockResolvedValue({ id: "chat-1" });
    mocks.deletePrivateVoiceBlobsForMessages.mockResolvedValue(0);
  });

  it("GET returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns 404 when chat is not found", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Chat not found" });
  });

  it("GET returns 400 when limit is not a positive integer", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/chat-1?limit=not-a-number"),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "limit must be a positive integer",
    });
    expect(mocks.chatFindFirst).not.toHaveBeenCalled();
  });

  it("GET returns mapped chat payload with pagination and usage", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/chat-1?limit=2&cursor=m-cursor"),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.chatFindFirst).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        OR: [{ userId: "user-1" }, { visibility: "PUBLIC" }],
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        routineContextMode: true,
        routineContextRoutine: {
          include: {
            attempts: {
              orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
              take: 1,
            },
          },
        },
      },
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        role: true,
        isGuest: true,
        preferences: { select: { showTechnicalMetrics: true } },
      },
    });
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
      cursor: { id: "m-cursor" },
      skip: 1,
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
            executionRoute: true,
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

    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "My Chat",
      icon: "BRAIN",
      visibility: "PRIVATE",
      isOwner: true,
      createdAt: "2026-02-16T10:00:00.000Z",
      updatedAt: "2026-02-16T11:00:00.000Z",
      messages: [
        {
          id: "m2",
          clientMessageId: "client-turn-1",
          role: "user",
          parts: [{ type: "text", text: "second" }],
          createdAt: "2026-02-16T11:00:02.000Z",
          ragUsed: false,
          feedback: null,
          attachments: [],
        },
        {
          id: "m3",
          sourceClientMessageId: "client-turn-1",
          role: "assistant",
          parts: [{ type: "text", text: "third" }],
          createdAt: "2026-02-16T11:00:03.000Z",
          model: "gpt-4o-mini",
          usage: {
            inputTokens: 10,
            outputTokens: 12,
            cost: 0.01,
            generationTimeMs: 230,
            reasoningTimeMs: 22,
            model: "gpt-4o-mini",
            executedProfile: "standard",
            toolCallCount: 1,
            ragUsed: true,
            serverTrace: serverTraceFixture,
            clientTrace: clientTraceFixture,
          },
          ragUsed: true,
          toolCalls: [{ name: "saveMemory", status: "completed" }],
          feedback: -1,
          feedbackReason: "too_generic",
          attachments: [
            {
              id: "att-1",
              name: "file.txt",
              contentType: "text/plain",
              size: 10,
              blobUrl: "https://example.com/file.txt",
            },
          ],
        },
      ],
      pagination: {
        hasMore: true,
        nextCursor: "m2",
      },
      routines: [],
    });
  });

  it.each([
    {
      role: "USER",
      preference: null,
      isGuest: false,
      public: false,
      expected: false,
    },
    {
      role: "USER",
      preference: true,
      isGuest: false,
      public: false,
      expected: true,
    },
    {
      role: "ADMIN",
      preference: null,
      isGuest: false,
      public: false,
      expected: true,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: true,
      public: false,
      expected: false,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: false,
      public: true,
      expected: false,
    },
  ] as const)(
    "GET omits technical fields unless the viewer is authorized: %o",
    async (testCase) => {
      mocks.getAuthUser.mockResolvedValue({
        user: { id: "user-1", role: testCase.role },
        error: null,
      });
      mocks.userFindUnique.mockResolvedValue({
        role: testCase.role,
        isGuest: testCase.isGuest,
        preferences: { showTechnicalMetrics: testCase.preference },
      });
      if (testCase.public) {
        mocks.chatFindFirst.mockResolvedValue({
          id: "chat-1",
          title: "Shared",
          visibility: "PUBLIC",
          userId: "owner-1",
          createdAt: new Date("2026-02-16T10:00:00.000Z"),
          updatedAt: new Date("2026-02-16T11:00:00.000Z"),
        });
      }

      const response = await GET(
        new Request("http://localhost/api/chats/chat-1"),
        { params: params() },
      );
      const body = (await response.json()) as {
        messages: Array<Record<string, unknown>>;
      };
      const assistant = body.messages.find((message) => message.id === "m3");

      if (testCase.expected) {
        expect(assistant).toMatchObject({
          model: "gpt-4o-mini",
          usage: {
            inputTokens: 10,
            outputTokens: 12,
            cost: 0.01,
          },
          ragUsed: true,
          toolCalls: [{ name: "saveMemory", status: "completed" }],
        });
      } else {
        expect(assistant).not.toHaveProperty("model");
        expect(assistant).not.toHaveProperty("usage");
        expect(assistant).not.toHaveProperty("ragUsed");
        expect(assistant).not.toHaveProperty("toolCalls");
        expect(assistant).not.toHaveProperty("metadata");
      }
    },
  );

  it("GET hydrates routines only for assistant messages in the cursor page", async () => {
    const proposal = {
      title: "Reset dopo un errore",
      trigger: "Quando perdi il punto",
      durationLabel: "60 secondi",
      steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
      completionCue: "Riparti sul compito",
    };
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-page",
        role: "ASSISTANT",
        parts: [{ type: "data-coachingRoutine", data: proposal }],
        createdAt: new Date("2026-08-08T10:02:00.000Z"),
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
      {
        id: "user-page",
        role: "USER",
        parts: [{ type: "text", text: "Aiutami" }],
        createdAt: new Date("2026-08-08T10:01:00.000Z"),
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
    mocks.routineFindMany.mockResolvedValue([
      {
        id: "routine-page",
        formatVersion: 1,
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-page",
        status: "ACTIVE",
        title: proposal.title,
        trigger: proposal.trigger,
        durationLabel: proposal.durationLabel,
        steps: proposal.steps,
        completionCue: proposal.completionCue,
        archivedAt: null,
        attempts: [],
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1?limit=2&cursor=next-page"),
      { params: params() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.routineFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: { in: ["assistant-page"] },
      },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    expect(body.routines).toEqual([
      {
        id: "routine-page",
        formatVersion: 1,
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-page",
        status: "ACTIVE",
        proposal,
        archivedAt: null,
        latestAttempt: null,
      },
    ]);
    expect(body.messages[1].parts).toEqual([
      { type: "data-coachingRoutine", data: proposal },
    ]);
  });

  it("GET returns the existing routine context for a repeat chat", async () => {
    const proposal = {
      title: "Reset già salvato",
      trigger: "Prima del gesto successivo",
      durationLabel: "60 secondi",
      steps: ["Espira", "Scegli il gesto"],
      completionCue: "Riparti sul compito",
    };
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
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
    });

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      { params: params() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.routineContext).toEqual({
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

  it("GET hydrates one authenticated owner routine source outside the current page", async () => {
    const proposal = {
      title: "Reset lontano",
      trigger: "Dopo un errore",
      durationLabel: null,
      steps: ["Fermati", "Espira"],
      completionCue: "Riparti",
    };
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-old",
        role: "ASSISTANT",
        parts: [
          { type: "text", text: "Prova questa routine." },
          { type: "data-coachingRoutine", data: proposal },
        ],
        createdAt: new Date("2026-07-01T10:00:00.000Z"),
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
        attachments: [{}],
      },
    ]);
    mocks.routineFindMany.mockResolvedValue([
      {
        id: "routine-old",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-old",
        status: "ACTIVE",
        title: proposal.title,
        trigger: proposal.trigger,
        durationLabel: proposal.durationLabel,
        steps: proposal.steps,
        completionCue: proposal.completionCue,
        archivedAt: null,
        attempts: [],
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/chats/chat-1?sourceAssistantMessageId=assistant-old&routineId=routine-old",
      ),
      { params: params() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          chatId: "chat-1",
          id: "assistant-old",
          role: "ASSISTANT",
        },
        take: 1,
      }),
    );
    expect(mocks.routineFindMany).toHaveBeenCalledWith({
      where: {
        id: "routine-old",
        userId: "user-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-old",
      },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      take: 2,
    });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({
      id: "assistant-old",
      role: "assistant",
      content: null,
      parts: [
        { type: "text", text: "Prova questa routine." },
        { type: "data-coachingRoutine", data: proposal },
      ],
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    expect(body.routines[0].id).toBe("routine-old");
    expect(body.pagination).toEqual({ hasMore: false, nextCursor: null });
  });

  it.each([
    [
      "no matching routine card part",
      [
        {
          id: "assistant-old",
          role: "ASSISTANT",
          parts: [],
          createdAt: new Date("2026-07-01T10:00:00.000Z"),
          attachments: [],
        },
      ],
    ],
    [
      "an unrelated extra message",
      [
        {
          id: "assistant-old",
          role: "ASSISTANT",
          parts: [
            { type: "text", text: "Prova questa routine." },
            {
              type: "data-coachingRoutine",
              data: {
                title: "Reset lontano",
                trigger: "Dopo un errore",
                durationLabel: null,
                steps: ["Fermati", "Espira"],
                completionCue: "Riparti",
              },
            },
          ],
          createdAt: new Date("2026-07-01T10:00:00.000Z"),
          attachments: [],
        },
        {
          id: "unrelated",
          role: "USER",
          parts: [{ type: "text", text: "Unrelated" }],
          createdAt: new Date("2026-07-01T10:01:00.000Z"),
          attachments: [],
        },
      ],
    ],
  ])("GET rejects targeted hydration with %s", async (_, messages) => {
    mocks.messageFindMany.mockResolvedValue(messages);
    mocks.routineFindMany.mockResolvedValue([
      {
        id: "routine-old",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-old",
        status: "ACTIVE",
        title: "Reset lontano",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: ["Fermati", "Espira"],
        completionCue: "Riparti",
        archivedAt: null,
        attempts: [],
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/chats/chat-1?sourceAssistantMessageId=assistant-old&routineId=routine-old",
      ),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Routine source not found",
    });
  });

  it("GET requires a routine id for targeted hydration", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/chats/chat-1?sourceAssistantMessageId=assistant-old",
      ),
      { params: params() },
    );

    expect(response.status).toBe(400);
    expect(mocks.chatFindFirst).not.toHaveBeenCalled();
  });

  it("GET rejects guest access to targeted routine source hydration", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "guest-1", role: "USER", isGuest: true },
      error: null,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/chats/chat-1?sourceAssistantMessageId=assistant-old&routineId=routine-old",
      ),
      { params: params() },
    );

    expect(response.status).toBe(403);
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an owner-visible public chat", "user-1"],
    ["a foreign public chat", "user-2"],
  ])("GET rejects targeted source hydration for %s", async (_, userId) => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Public Chat",
      visibility: "PUBLIC",
      userId,
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      updatedAt: new Date("2026-02-16T11:00:00.000Z"),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/chats/chat-1?sourceAssistantMessageId=assistant-old&routineId=routine-old",
      ),
      { params: params() },
    );

    expect(response.status).toBe(403);
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it("GET keeps a private guest proposal but never hydrates saved routines", async () => {
    const proposal = {
      title: "Reset rapido",
      trigger: "Prima del servizio",
      durationLabel: null,
      steps: ["Espira lentamente", "Guarda il bersaglio"],
      completionCue: "Inizia il movimento",
    };
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER", isGuest: true },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: true,
      preferences: { showTechnicalMetrics: true },
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-guest",
        role: "ASSISTANT",
        parts: [{ type: "data-coachingRoutine", data: proposal }],
        createdAt: new Date("2026-08-08T10:02:00.000Z"),
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

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      { params: params() },
    );
    const body = await response.json();

    expect(body.routines).toEqual([]);
    expect(body.messages[0].parts).toEqual([
      { type: "data-coachingRoutine", data: proposal },
    ]);
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it("GET strips proposal parts and raw tool calls from a public foreign cursor page", async () => {
    const proposal = {
      title: "Routine privata",
      trigger: "Quando sale la tensione",
      durationLabel: "45 secondi",
      steps: ["Respira", "Scegli un gesto"],
      completionCue: "Torna al presente",
    };
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "viewer-1", role: "USER", isGuest: false },
      error: null,
    });
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Shared",
      visibility: "PUBLIC",
      userId: "owner-1",
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:02:00.000Z"),
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-public",
        role: "ASSISTANT",
        parts: [
          { type: "text", text: "Testo pubblico" },
          { type: "data-coachingRoutine", data: proposal },
        ],
        createdAt: new Date("2026-08-08T10:02:00.000Z"),
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

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1?cursor=next-page"),
      { params: params() },
    );
    const body = await response.json();

    expect(body.routines).toEqual([]);
    expect(body.messages[0].parts).toEqual([
      { type: "text", text: "Testo pubblico" },
    ]);
    expect(body.messages[0]).not.toHaveProperty("toolCalls");
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
    "GET fails closed for malformed %s parts in a public foreign payload",
    async (_label, parts) => {
      mocks.getAuthUser.mockResolvedValue({
        user: { id: "viewer-1", role: "USER", isGuest: false },
        error: null,
      });
      mocks.chatFindFirst.mockResolvedValue({
        id: "chat-1",
        title: "Shared",
        visibility: "PUBLIC",
        userId: "owner-1",
        createdAt: new Date("2026-08-08T10:00:00.000Z"),
        updatedAt: new Date("2026-08-08T10:02:00.000Z"),
      });
      mocks.messageFindMany.mockResolvedValue([
        {
          id: "assistant-malformed",
          role: "ASSISTANT",
          parts,
          createdAt: new Date("2026-08-08T10:02:00.000Z"),
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

      const response = await GET(
        new Request("http://localhost/api/chats/chat-1"),
        { params: params() },
      );
      const body = await response.json();

      expect(body.messages[0].parts).toEqual([]);
      expect(body.routines).toEqual([]);
    },
  );

  it("GET returns 500 on database errors", async () => {
    mocks.messageFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch chat",
    });
  });

  it("PATCH returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "hello" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("PATCH returns 404 when chat is not owned by user", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "hello" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("PATCH returns 400 when request body is malformed JSON", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: "{",
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body",
    });
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
    expect(mocks.chatUpdate).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 when visibility is invalid", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ visibility: "SHARED" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid visibility",
    });
    expect(mocks.chatUpdate).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 when title is not a string", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: { text: "Manual title" } }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "title must be a string",
    });
    expect(mocks.chatUpdate).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 when generateTitle is not a boolean", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ generateTitle: "true" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "generateTitle must be a boolean",
    });
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
    expect(mocks.chatUpdate).not.toHaveBeenCalled();
  });

  it("PATCH auto-generates title from first user message", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ generateTitle: true, visibility: "PUBLIC" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { chatId: "chat-1", role: "USER" },
      orderBy: { createdAt: "asc" },
      select: { parts: true },
    });
    expect(mocks.generateChatMetadata).toHaveBeenCalledWith(
      [{ role: "user", text: "How do I test this route?" }],
      "How do I test this route?",
      { userId: "user-1" },
    );
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Generated Title",
        icon: "TARGET",
        visibility: "PUBLIC",
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        updatedAt: true,
      },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "max");
    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "Generated Title",
      icon: "TARGET",
      visibility: "PUBLIC",
      updatedAt: "2026-02-16T12:00:00.000Z",
    });
  });

  it("PATCH marks customTitle when explicit title is provided", async () => {
    await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Manual title" }),
      }),
      { params: params() },
    );

    expect(mocks.generateChatMetadata).not.toHaveBeenCalled();
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Manual title",
        customTitle: true,
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        updatedAt: true,
      },
    });
  });

  it("PATCH returns 500 when update fails", async () => {
    mocks.chatUpdate.mockRejectedValue(new Error("update failed"));

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Manual title" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update chat",
    });
  });

  it("DELETE returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("DELETE returns 404 when chat is not owned by user", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("DELETE removes chat and revalidates cache", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateVoiceBlobsForMessages).toHaveBeenCalledWith({
      chatId: "chat-1",
    });
    expect(mocks.chatDelete).toHaveBeenCalledWith({ where: { id: "chat-1" } });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "max");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE still succeeds when revalidateTag fails", async () => {
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error("revalidation failed");
    });

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE returns 500 when delete fails", async () => {
    mocks.chatDelete.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete chat",
    });
  });

  it("DELETE keeps the chat when private voice cleanup fails", async () => {
    mocks.deletePrivateVoiceBlobsForMessages.mockRejectedValue(
      new Error("blob cleanup failed"),
    );

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    expect(mocks.chatDelete).not.toHaveBeenCalled();
  });
});
