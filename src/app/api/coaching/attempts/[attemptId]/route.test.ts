import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const attemptFindFirst = vi.fn();
  const attemptUpdate = vi.fn();
  const routineUpdate = vi.fn();
  const tx = {
    routineAttempt: { update: attemptUpdate },
    routine: { update: routineUpdate },
  };
  return {
    getAuthUser: vi.fn(),
    attemptFindFirst,
    attemptUpdate,
    routineUpdate,
    transaction: vi.fn(),
    revalidateTag: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    routineAttempt: { findFirst: mocks.attemptFindFirst },
    routine: { update: mocks.routineUpdate },
    $transaction: mocks.transaction,
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import * as route from "./route";

const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: null,
  steps: ["Fermati", "Espira lentamente"],
  completionCue: "Riparti sul compito successivo",
};
const routineCardRecord = {
  id: "routine-1",
  userId: "user-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "cm123456789012345678901234",
  status: "ACTIVE" as const,
  ...proposal,
  archivedAt: null,
  attempts: [
    {
      id: "attempt-1",
      attemptedAt: new Date("2026-08-08T09:00:00.000Z"),
      outcome: "PARTIALLY_HELPFUL" as const,
      outcomeNote: "Un po'",
      outcomeRecordedAt: new Date("2026-08-08T09:05:00.000Z"),
    },
  ],
};
const context = { params: Promise.resolve({ attemptId: "attempt-1" }) };
const request = (
  body: unknown = {
    outcome: "PARTIALLY_HELPFUL",
    outcomeNote: " Un po' ",
  },
) =>
  new Request("http://localhost/api/coaching/attempts/attempt-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/coaching/attempts/[attemptId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.attemptFindFirst.mockResolvedValue({
      id: "attempt-1",
      routineId: "routine-1",
    });
    mocks.attemptUpdate.mockResolvedValue({ id: "attempt-1" });
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
    expect((await route.PATCH(request(), context)).status).toBe(401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    expect((await route.PATCH(request(), context)).status).toBe(403);
    expect(mocks.attemptFindFirst).not.toHaveBeenCalled();
  });

  it("checks owner and active status before mutation and hides outsiders", async () => {
    mocks.attemptFindFirst.mockResolvedValue(null);

    const response = await route.PATCH(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.attemptFindFirst).toHaveBeenCalledWith({
      where: {
        id: "attempt-1",
        routine: { userId: "user-1", status: "ACTIVE" },
      },
      select: { id: true, routineId: true },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("saves the constrained outcome and touches the parent in one transaction", async () => {
    const response = await route.PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.attemptUpdate).toHaveBeenCalledWith({
      where: { id: "attempt-1" },
      data: {
        outcome: "PARTIALLY_HELPFUL",
        outcomeNote: "Un po'",
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
    const outcomeTime =
      mocks.attemptUpdate.mock.calls[0]?.[0].data.outcomeRecordedAt;
    const parentTime = mocks.routineUpdate.mock.calls[0]?.[0].data.updatedAt;
    expect(parentTime).toBe(outcomeTime);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
  });

  it.each([
    [{}],
    [{ outcome: "UNKNOWN" }],
    [{ outcome: "HELPFUL", outcomeNote: "a".repeat(1001) }],
    [{ outcome: "HELPFUL", routineId: "routine-2" }],
  ])("rejects malformed check-ins: %o", async (body) => {
    const response = await route.PATCH(request(body), context);

    expect(response.status).toBe(400);
    expect(mocks.attemptFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before reading the attempt", async () => {
    const response = await route.PATCH(
      {
        json: async () => Promise.reject(new Error("invalid")),
      } as unknown as Request,
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.attemptFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not expose GET or mutate an outcome during a plain refresh", () => {
    expect(route).not.toHaveProperty("GET");
    expect(mocks.attemptUpdate).not.toHaveBeenCalled();
    expect(mocks.routineUpdate).not.toHaveBeenCalled();
  });
});
