import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  userFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    profile: { upsert: mocks.profileUpsert },
  },
}));
vi.mock("@/lib/ai/coaching-context-cache", () => ({
  invalidateCoachingContextPromptCaches: mocks.invalidate,
}));

import { GET, PATCH } from "./route";

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/coaching-context", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/coaching-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1" },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      profile: { sport: "Tennis", goal: "Più fiducia", experience: null },
      memories: [
        {
          id: "memory-1",
          value: { content: "Partita domenica", confidence: 0.9 },
          category: "schedule",
          updatedAt: new Date("2026-07-31T08:00:00.000Z"),
        },
      ],
    });
    mocks.profileUpsert.mockResolvedValue({
      sport: "Tennis",
      goal: "Restare lucido",
      experience: null,
    });
  });

  it("rejects unauthenticated reads", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });
    expect((await GET()).status).toBe(401);
  });

  it("returns only user-facing profile and memory fields", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      profile: { sport: "Tennis", goal: "Più fiducia", experience: null },
      memories: [
        {
          id: "memory-1",
          content: "Partita domenica",
          category: "schedule",
          updatedAt: "2026-07-31T08:00:00.000Z",
        },
      ],
    });
  });

  it("skips malformed memory values", async () => {
    mocks.userFindUnique.mockResolvedValue({
      profile: null,
      memories: [
        { id: "bad", value: {}, category: "other", updatedAt: new Date() },
      ],
    });

    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      profile: { sport: null, goal: null, experience: null },
      memories: [],
    });
  });

  it("updates only explicit coaching profile fields and invalidates caches", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    const response = await PATCH(
      patchRequest({ goal: "  Restare lucido  ", experience: "" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: { goal: "Restare lucido", experience: null },
      create: {
        userId: "user-1",
        goal: "Restare lucido",
        experience: null,
      },
      select: { sport: true, goal: true, experience: true },
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("rejects unknown or oversized profile fields", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    expect((await PATCH(patchRequest({ notes: "private" }))).status).toBe(400);
    expect((await PATCH(patchRequest({ goal: "x".repeat(501) }))).status).toBe(
      400,
    );
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });
});
