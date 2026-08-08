import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const routineFindFirst = vi.fn();
  const routineUpdateMany = vi.fn();
  const routineUpdate = vi.fn();
  const routineDelete = vi.fn();
  const tx = {
    routine: {
      findFirst: routineFindFirst,
      updateMany: routineUpdateMany,
    },
  };
  return {
    getAuthUser: vi.fn(),
    routineFindFirst,
    routineUpdateMany,
    routineUpdate,
    routineDelete,
    transaction: vi.fn(),
    revalidateTag: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    routine: {
      findFirst: mocks.routineFindFirst,
      update: mocks.routineUpdate,
      delete: mocks.routineDelete,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { PATCH } from "./route";

const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira lentamente"],
  completionCue: "Riparti sul compito successivo",
};
const archivedRoutine = {
  id: "routine-1",
  userId: "user-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "cm123456789012345678901234",
  status: "ARCHIVED" as const,
  ...proposal,
  archivedAt: new Date("2026-08-08T09:00:00.000Z"),
  attempts: [],
};
const activeRoutine = {
  ...archivedRoutine,
  status: "ACTIVE" as const,
  archivedAt: null,
};
const context = { params: Promise.resolve({ routineId: "routine-1" }) };
const request = (body: unknown = { status: "ARCHIVED" }) =>
  new Request("http://localhost/api/coaching/routines/routine-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/coaching/routines/[routineId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.routineFindFirst
      .mockResolvedValueOnce(activeRoutine)
      .mockResolvedValue(archivedRoutine);
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
    expect((await PATCH(request(), context)).status).toBe(401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    expect((await PATCH(request(), context)).status).toBe(403);
    expect(mocks.routineFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 without revealing another user's routine", async () => {
    mocks.routineFindFirst.mockReset().mockResolvedValue(null);

    const response = await PATCH(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.routineFindFirst).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1" },
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
  });

  it("archives with a timestamp, preserves history, and returns the card", async () => {
    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.routineUpdateMany).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1", status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: expect.any(Date) },
    });
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
    expect(mocks.routineDelete).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
    await expect(response.json()).resolves.toEqual({
      routine: {
        id: "routine-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "cm123456789012345678901234",
        status: "ARCHIVED",
        proposal,
        archivedAt: "2026-08-08T09:00:00.000Z",
        latestAttempt: null,
      },
    });
  });

  it("returns an already archived routine without rewriting its lifecycle timestamps", async () => {
    mocks.routineFindFirst.mockReset().mockResolvedValue(archivedRoutine);

    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.routineUpdateMany).not.toHaveBeenCalled();
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      routine: {
        id: "routine-1",
        status: "ARCHIVED",
        archivedAt: "2026-08-08T09:00:00.000Z",
      },
    });
  });

  it.each([
    [{}],
    [{ status: "ACTIVE" }],
    [{ status: "ARCHIVED", archivedAt: "2026-08-08" }],
  ])("rejects a malformed or non-archive body: %o", async (body) => {
    const response = await PATCH(request(body), context);

    expect(response.status).toBe(400);
    expect(mocks.routineFindFirst).not.toHaveBeenCalled();
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await PATCH(
      {
        json: async () => Promise.reject(new Error("invalid")),
      } as unknown as Request,
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
  });
});
