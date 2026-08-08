import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  messageFindFirst: vi.fn(),
  routineFindUnique: vi.fn(),
  routineFindFirst: vi.fn(),
  routineFindMany: vi.fn(),
  routineCount: vi.fn(),
  routineUpsert: vi.fn(),
  getActiveRoutineForReturn: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    message: { findFirst: mocks.messageFindFirst },
    routine: {
      findUnique: mocks.routineFindUnique,
      findFirst: mocks.routineFindFirst,
      findMany: mocks.routineFindMany,
      count: mocks.routineCount,
      upsert: mocks.routineUpsert,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/coaching/routine-return.server", () => ({
  getActiveRoutineForReturn: mocks.getActiveRoutineForReturn,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { GET, POST } from "./route";

const sourceAssistantMessageId = "cm123456789012345678901234";
const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
  completionCue: "Riparti con lo sguardo sul compito successivo",
};
const routine = {
  id: "routine-1",
  userId: "user-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId,
  status: "ACTIVE" as const,
  ...proposal,
  archivedAt: null,
  attempts: [],
  createdAt: new Date("2026-08-08T08:00:00.000Z"),
  updatedAt: new Date("2026-08-08T08:00:00.000Z"),
};

const request = (body: unknown = { sourceAssistantMessageId }) =>
  new Request("http://localhost/api/coaching/routines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/coaching/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.messageFindFirst.mockResolvedValue({
      chatId: "chat-1",
      parts: [
        { type: "text", text: "Prova questa routine" },
        { type: "data-coachingRoutine", data: proposal },
      ],
    });
    mocks.routineFindUnique.mockResolvedValue(null);
    mocks.routineFindFirst.mockResolvedValue({
      id: "cm123456789012345678901235",
    });
    mocks.routineUpsert.mockResolvedValue(routine);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated guest", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });

  it("loads only the owner's private assistant source message", async () => {
    await POST(request());

    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: {
        id: sourceAssistantMessageId,
        userId: "user-1",
        role: "ASSISTANT",
        chat: { is: { userId: "user-1", visibility: "PRIVATE" } },
      },
      select: { chatId: true, parts: true },
    });
  });

  it("returns 404 when the source is missing or belongs to someone else", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.routineUpsert).not.toHaveBeenCalled();
  });

  it("returns 422 when the source has no single validated routine part", async () => {
    mocks.messageFindFirst.mockResolvedValue({
      chatId: "chat-1",
      parts: [{ type: "text", text: "Nessuna routine" }],
    });

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(mocks.routineUpsert).not.toHaveBeenCalled();
  });

  it("creates only a trusted snapshot and returns 201", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.routineUpsert).toHaveBeenCalledWith({
      where: {
        userId_sourceAssistantMessageId: {
          userId: "user-1",
          sourceAssistantMessageId,
        },
      },
      update: {},
      create: {
        userId: "user-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId,
        derivedFromRoutineId: null,
        formatVersion: 1,
        ...proposal,
      },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      routine: {
        id: "routine-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId,
        status: "ACTIVE",
        formatVersion: 1,
        proposal,
        archivedAt: null,
        latestAttempt: null,
      },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
  });

  it("persists and reads back a v2 proposal with formatVersion 2", async () => {
    const v2Proposal = {
      formatVersion: 2 as const,
      title: proposal.title,
      trigger: proposal.trigger,
      durationLabel: proposal.durationLabel,
      completionCue: proposal.completionCue,
      steps: [
        { id: "ground", kind: "instruction" as const, text: "Fermati" },
        {
          id: "outcome",
          kind: "form" as const,
          question: "Quanto ti è stata utile?",
          mode: "choice" as const,
          options: [
            { label: "Sì", outcome: "HELPFUL" as const },
            { label: "In parte", outcome: "PARTIALLY_HELPFUL" as const },
            { label: "No", outcome: "NOT_HELPFUL" as const },
          ],
          noteEnabled: false,
        },
      ],
    };
    mocks.messageFindFirst.mockResolvedValue({
      chatId: "chat-1",
      parts: [{ type: "data-coachingRoutine", data: v2Proposal }],
    });
    mocks.routineUpsert.mockResolvedValue({
      ...routine,
      formatVersion: 2,
      steps: v2Proposal.steps,
      attempts: [],
    });

    const response = await POST(request());

    expect(mocks.routineUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          formatVersion: 2,
          steps: v2Proposal.steps,
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      routine: { formatVersion: 2, proposal: { formatVersion: 2 } },
    });
  });

  it("links an adaptation only to an original routine owned by the requester", async () => {
    const response = await POST(
      request({
        sourceAssistantMessageId,
        derivedFromRoutineId: "cm123456789012345678901235",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.routineFindFirst).toHaveBeenCalledWith({
      where: { id: "cm123456789012345678901235", userId: "user-1" },
      select: { id: true },
    });
    expect(mocks.routineUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derivedFromRoutineId: "cm123456789012345678901235",
        }),
      }),
    );
  });

  it("does not link an adaptation to a missing or foreign original routine", async () => {
    mocks.routineFindFirst.mockResolvedValue(null);

    const response = await POST(
      request({
        sourceAssistantMessageId,
        derivedFromRoutineId: "cm123456789012345678901235",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.routineUpsert).not.toHaveBeenCalled();
  });

  it("returns the existing owner/message routine with 200 on retry", async () => {
    mocks.routineFindUnique.mockResolvedValue(routine);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.routineFindUnique).toHaveBeenCalledWith({
      where: {
        userId_sourceAssistantMessageId: {
          userId: "user-1",
          sourceAssistantMessageId,
        },
      },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    expect(mocks.routineUpsert).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("converges a concurrent source upsert onto the existing routine", async () => {
    mocks.routineFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(routine);
    mocks.routineUpsert.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.routineFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.routineUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      routine: { id: "routine-1" },
    });
  });

  it.each([
    [{ sourceAssistantMessageId, title: "Client title" }],
    [{ sourceAssistantMessageId, steps: ["Client step"] }],
    [{ sourceAssistantMessageId, userId: "outsider" }],
    [{ sourceAssistantMessageId, chatId: "public-chat" }],
    [{ sourceAssistantMessageId, proposal }],
    [{ sourceAssistantMessageId: "not-a-cuid" }],
  ])(
    "rejects malformed or client-authored snapshot fields: %o",
    async (body) => {
      const response = await POST(request(body));

      expect(response.status).toBe(400);
      expect(mocks.messageFindFirst).not.toHaveBeenCalled();
      expect(mocks.routineUpsert).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for malformed JSON", async () => {
    const response = await POST({
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Request);

    expect(response.status).toBe(400);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/coaching/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.getActiveRoutineForReturn.mockResolvedValue({
      id: "routine-1",
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ACTIVE",
      proposal,
      archivedAt: null,
      latestAttempt: null,
    });
  });

  it("returns only the authenticated owner's card-safe active selector", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getActiveRoutineForReturn).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      routine: {
        id: "routine-1",
        sourceChatId: null,
        sourceAssistantMessageId: null,
        status: "ACTIVE",
        proposal,
        archivedAt: null,
        latestAttempt: null,
      },
    });
  });

  it("rejects guests without querying private routine state", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.getActiveRoutineForReturn).not.toHaveBeenCalled();
  });

  it("returns 401 when the active selector request is unauthenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getActiveRoutineForReturn).not.toHaveBeenCalled();
  });

  it("returns an owner-scoped collection split by status without source content", async () => {
    mocks.routineCount.mockResolvedValue(1);
    mocks.routineFindMany.mockResolvedValue([
      {
        ...routine,
        status: "ARCHIVED" as const,
        formatVersion: 1,
        title: proposal.title,
        trigger: proposal.trigger,
        durationLabel: proposal.durationLabel,
        steps: proposal.steps,
        completionCue: proposal.completionCue,
        attempts: [],
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/coaching/routines?mode=collection&status=ARCHIVED&limit=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.routineCount).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ARCHIVED",
        OR: [
          { sourceChatId: null },
          {
            sourceChat: {
              is: { userId: "user-1", visibility: "PRIVATE" },
            },
          },
        ],
      },
    });
    expect(mocks.routineFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ARCHIVED",
        OR: [
          { sourceChatId: null },
          {
            sourceChat: {
              is: { userId: "user-1", visibility: "PRIVATE" },
            },
          },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 2,
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      routines: [
        {
          id: "routine-1",
          sourceChatId: "chat-1",
          sourceAssistantMessageId,
          status: "ARCHIVED",
          formatVersion: 1,
          proposal,
          archivedAt: null,
          latestAttempt: null,
        },
      ],
      total: 1,
      nextCursor: null,
    });
  });

  it.each([
    "UNKNOWN",
    "ACTIVE&limit=0",
    "ACTIVE&limit=21",
    "ACTIVE&cursor=not-a-cursor",
  ])("returns 400 for an invalid collection query: %s", async (query) => {
    const response = await GET(
      new Request(
        `http://localhost/api/coaching/routines?mode=collection&status=${query}`,
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.routineFindMany).not.toHaveBeenCalled();
  });

  it("rejects collection access for unauthenticated users and guests", async () => {
    mocks.getAuthUser.mockResolvedValueOnce({ user: null, error: "No auth" });
    await expect(
      GET(
        new Request(
          "http://localhost/api/coaching/routines?mode=collection&status=ACTIVE",
        ),
      ),
    ).resolves.toHaveProperty("status", 401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    await expect(
      GET(
        new Request(
          "http://localhost/api/coaching/routines?mode=collection&status=ACTIVE",
        ),
      ),
    ).resolves.toHaveProperty("status", 403);
    expect(mocks.routineCount).not.toHaveBeenCalled();
  });
});
