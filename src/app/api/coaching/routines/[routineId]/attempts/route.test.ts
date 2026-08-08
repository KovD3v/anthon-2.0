import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const routineFindFirst = vi.fn();
  const routineUpdate = vi.fn();
  const attemptFindUnique = vi.fn();
  const attemptCreate = vi.fn();
  const tx = {
    routine: { findFirst: routineFindFirst, update: routineUpdate },
    routineAttempt: {
      findUnique: attemptFindUnique,
      create: attemptCreate,
    },
  };
  return {
    getAuthUser: vi.fn(),
    routineFindFirst,
    routineUpdate,
    attemptFindUnique,
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
    mocks.routineFindFirst.mockResolvedValue({
      id: "routine-1",
      status: "ACTIVE",
    });
    mocks.attemptFindUnique.mockResolvedValue(null);
    mocks.attemptCreate.mockResolvedValue(latestAttempt);
    mocks.routineUpdate.mockResolvedValue(routineCardRecord);
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
    expect(mocks.routineUpdate).toHaveBeenCalledWith({
      where: { id: "routine-1" },
      data: { updatedAt: expect.any(Date) },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
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

  it("returns a repeated action once with 200 without touching the parent", async () => {
    mocks.attemptFindUnique.mockResolvedValue({ id: "attempt-1" });
    mocks.routineFindFirst
      .mockResolvedValueOnce({ id: "routine-1", status: "ACTIVE" })
      .mockResolvedValueOnce(routineCardRecord);

    const response = await route.POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
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

  it("does not expose GET or create an attempt during a plain refresh", () => {
    expect(route).not.toHaveProperty("GET");
    expect(mocks.attemptCreate).not.toHaveBeenCalled();
  });
});
