import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const routineFindFirst = vi.fn();
  const routineUpdate = vi.fn();
  const routineUpdateMany = vi.fn();
  const attemptFindUnique = vi.fn();
  const attemptFindMany = vi.fn();
  const attemptCreate = vi.fn();
  const tx = {
    routine: {
      findFirst: routineFindFirst,
      update: routineUpdate,
      updateMany: routineUpdateMany,
    },
    routineAttempt: {
      findUnique: attemptFindUnique,
      findMany: attemptFindMany,
      create: attemptCreate,
    },
  };
  return {
    getAuthUser: vi.fn(),
    routineFindFirst,
    routineUpdate,
    routineUpdateMany,
    attemptFindUnique,
    attemptFindMany,
    attemptCreate,
    transaction: vi.fn(),
    revalidateTag: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: { ...mocks.tx, $transaction: mocks.transaction },
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import * as route from "./route";

const clientActionId = "11111111-1111-4111-8111-111111111111";
const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: null,
  steps: ["Fermati", "Espira lentamente"],
  completionCue: "Riparti sul compito successivo",
};
const latestAttempt = {
  id: "attempt-1",
  routineId: "routine-1",
  clientActionId,
  attemptedAt: new Date("2026-08-08T09:00:00.000Z"),
  outcome: "HELPFUL" as const,
  outcomeNote: "Mi ha aiutato",
  outcomeRecordedAt: new Date("2026-08-08T09:00:00.000Z"),
};
const routineCardRecord = {
  id: "routine-1",
  userId: "user-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "cm123456789012345678901234",
  status: "ACTIVE" as const,
  ...proposal,
  archivedAt: null,
  attempts: [latestAttempt],
};
const context = { params: Promise.resolve({ routineId: "routine-1" }) };
const request = (
  body: unknown = {
    clientActionId,
    outcome: "HELPFUL",
    outcomeNote: " Mi ha aiutato ",
  },
) =>
  new Request("http://localhost/api/coaching/routines/routine-1/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/coaching/routines/[routineId]/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.routineFindFirst.mockResolvedValue(routineCardRecord);
    mocks.attemptFindUnique.mockResolvedValue(null);
    mocks.attemptCreate.mockResolvedValue(latestAttempt);
    mocks.routineUpdate.mockResolvedValue(routineCardRecord);
    mocks.routineUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
    );
  });

  it("returns 401 when unauthenticated and 403 for a guest", async () => {
    mocks.getAuthUser.mockResolvedValueOnce({
      user: null,
      error: "Not authenticated",
    });
    expect((await route.POST(request(), context)).status).toBe(401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    expect((await route.POST(request(), context)).status).toBe(403);
    expect(mocks.routineFindFirst).not.toHaveBeenCalled();
  });

  it("returns owner-scoped 404 for a missing or foreign routine", async () => {
    mocks.routineFindFirst.mockResolvedValue(null);

    const response = await route.POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.routineFindFirst).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1" },
      select: { id: true, status: true },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 409 for an archived routine", async () => {
    mocks.routineFindFirst.mockResolvedValue({
      id: "routine-1",
      status: "ARCHIVED",
    });

    const response = await route.POST(request(), context);

    expect(response.status).toBe(409);
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
  });

  it("creates one attempt with an outcome timestamp and touches the parent", async () => {
    const response = await route.POST(request(), context);

    expect(response.status).toBe(201);
    expect(mocks.attemptCreate).toHaveBeenCalledWith({
      data: {
        routineId: "routine-1",
        clientActionId,
        outcome: "HELPFUL",
        outcomeNote: "Mi ha aiutato",
        outcomeRecordedAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(mocks.routineUpdateMany).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1", status: "ACTIVE" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
    const outcomeTime =
      mocks.attemptCreate.mock.calls[0]?.[0].data.outcomeRecordedAt;
    const parentTime =
      mocks.routineUpdateMany.mock.calls[0]?.[0].data.updatedAt;
    expect(parentTime).toBe(outcomeTime);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
    await expect(response.json()).resolves.toMatchObject({
      routine: {
        id: "routine-1",
        latestAttempt: {
          id: "attempt-1",
          outcome: "HELPFUL",
          outcomeRecordedAt: "2026-08-08T09:00:00.000Z",
        },
      },
    });
  });

  it("creates an attempt without fabricating an optional outcome timestamp", async () => {
    await route.POST(request({ clientActionId }), context);

    expect(mocks.attemptCreate).toHaveBeenCalledWith({
      data: {
        routineId: "routine-1",
        clientActionId,
        outcome: undefined,
        outcomeNote: undefined,
        outcomeRecordedAt: null,
      },
      select: { id: true },
    });
  });

  it("rejects the mutation when the routine is archived after the initial lookup", async () => {
    mocks.routineUpdateMany.mockResolvedValue({ count: 0 });

    const response = await route.POST(request(), context);

    expect(response.status).toBe(409);
    expect(mocks.routineUpdateMany).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1", status: "ACTIVE" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("returns a repeated action once with 200 without touching the parent", async () => {
    mocks.attemptFindUnique.mockResolvedValue({ id: "attempt-1" });
    mocks.routineFindFirst
      .mockResolvedValueOnce({ id: "routine-1", status: "ACTIVE" })
      .mockResolvedValueOnce(routineCardRecord);

    const response = await route.POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
    expect(mocks.routineUpdateMany).not.toHaveBeenCalled();
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("converges a concurrent unique retry without touching the parent", async () => {
    mocks.attemptFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "attempt-1" });
    mocks.attemptCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    mocks.routineFindFirst
      .mockResolvedValueOnce({ id: "routine-1", status: "ACTIVE" })
      .mockResolvedValueOnce(routineCardRecord);

    const response = await route.POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.attemptFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [{ clientActionId: "not-a-uuid" }],
    [{ clientActionId, outcome: "UNKNOWN" }],
    [{ clientActionId, outcomeNote: "a".repeat(1001) }],
    [{ clientActionId, routineId: "another-routine" }],
  ])("rejects malformed attempts: %o", async (body) => {
    const response = await route.POST(request(body), context);

    expect(response.status).toBe(400);
    expect(mocks.routineFindFirst).not.toHaveBeenCalled();
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before reading the routine", async () => {
    const response = await route.POST(
      {
        json: async () => Promise.reject(new Error("invalid")),
      } as unknown as Request,
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.routineFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not create an attempt during a plain refresh", () => {
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
    expect(mocks.routineUpdateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/coaching/routines/[routineId]/attempts", () => {
  const historyRequest = (suffix = "") =>
    new Request(
      `http://localhost/api/coaching/routines/routine-1/attempts${suffix}`,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.routineFindFirst.mockResolvedValue({ id: "routine-1" });
    mocks.attemptFindMany.mockResolvedValue([
      latestAttempt,
      {
        ...latestAttempt,
        id: "attempt-0",
        attemptedAt: new Date("2026-08-07T09:00:00.000Z"),
      },
    ]);
  });

  it("returns owner-scoped, newest-first attempt history including the owner's note", async () => {
    const response = await route.GET(historyRequest("?limit=1"), context);

    expect(response.status).toBe(200);
    expect(mocks.routineFindFirst).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1" },
      select: { id: true },
    });
    expect(mocks.attemptFindMany).toHaveBeenCalledWith({
      where: { routineId: "routine-1" },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
      take: 2,
      select: {
        id: true,
        attemptedAt: true,
        outcome: true,
        outcomeNote: true,
        outcomeRecordedAt: true,
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      attempts: [
        { id: "attempt-1", outcome: "HELPFUL", outcomeNote: "Mi ha aiutato" },
      ],
      nextCursor: expect.any(String),
    });
  });

  it("rejects unauthenticated, guest, and foreign routine history reads", async () => {
    mocks.getAuthUser.mockResolvedValueOnce({
      user: null,
      error: "Unauthorized",
    });
    expect((await route.GET(historyRequest(), context)).status).toBe(401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    expect((await route.GET(historyRequest(), context)).status).toBe(403);

    mocks.routineFindFirst.mockResolvedValueOnce(null);
    expect((await route.GET(historyRequest(), context)).status).toBe(404);
    expect(mocks.attemptFindMany).not.toHaveBeenCalled();
  });

  it("uses a stable cursor and rejects malformed cursors without querying attempts", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        attemptedAt: "2026-08-08T09:00:00.000Z",
        id: "attempt-1",
      }),
    ).toString("base64url");
    await route.GET(historyRequest(`?cursor=${cursor}`), context);
    expect(mocks.attemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          routineId: "routine-1",
          OR: [
            { attemptedAt: { lt: new Date("2026-08-08T09:00:00.000Z") } },
            {
              attemptedAt: new Date("2026-08-08T09:00:00.000Z"),
              id: { lt: "attempt-1" },
            },
          ],
        },
      }),
    );
    mocks.attemptFindMany.mockClear();
    expect(
      (await route.GET(historyRequest("?cursor=not-base64"), context)).status,
    ).toBe(400);
    expect(mocks.attemptFindMany).not.toHaveBeenCalled();
  });
});
