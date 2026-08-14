import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  userFindUnique: vi.fn(),
  listActiveFacts: vi.fn(),
  updateCanonicalProfile: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/ai/memory-facts", () => ({
  listActiveFacts: mocks.listActiveFacts,
}));
vi.mock("@/lib/ai/user-knowledge", () => ({
  updateCanonicalProfile: mocks.updateCanonicalProfile,
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
      profile: {
        age: 24,
        occupation: "Studentessa di medicina",
        sport: "Tennis",
        goal: "Più fiducia",
        experience: null,
      },
    });
    mocks.listActiveFacts.mockResolvedValue({
      degraded: false,
      facts: [
        {
          id: "memory-1",
          key: "match_schedule",
          content: "Partita domenica",
          category: "schedule",
          confidence: 0.9,
          origin: "EXPLICIT",
          observedAt: new Date("2026-07-31T08:00:00.000Z"),
          updatedAt: new Date("2026-07-31T08:00:00.000Z"),
        },
      ],
    });
    mocks.updateCanonicalProfile.mockResolvedValue({
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
      profile: {
        age: 24,
        occupation: "Studentessa di medicina",
        sport: "Tennis",
        goal: "Più fiducia",
        experience: null,
      },
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
    });
    mocks.listActiveFacts.mockResolvedValue({ degraded: false, facts: [] });

    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      profile: {
        age: null,
        occupation: null,
        sport: null,
        goal: null,
        experience: null,
      },
      memories: [],
    });
  });

  it("updates only explicit coaching profile fields and invalidates caches", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    const response = await PATCH(
      patchRequest({ goal: "  Restare lucido  ", experience: "" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateCanonicalProfile).toHaveBeenCalledWith("user-1", {
      goal: "Restare lucido",
      experience: null,
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("accepts age and work or study context", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    const response = await PATCH(
      patchRequest({ age: 24, occupation: "Studentessa di medicina" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateCanonicalProfile).toHaveBeenCalledWith("user-1", {
      age: 24,
      occupation: "Studentessa di medicina",
    });
  });

  it("rejects unknown or oversized profile fields", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    expect((await PATCH(patchRequest({ notes: "private" }))).status).toBe(400);
    expect((await PATCH(patchRequest({ goal: "x".repeat(501) }))).status).toBe(
      400,
    );
    expect(mocks.updateCanonicalProfile).not.toHaveBeenCalled();
  });

  it("loads memories through the bounded active-fact service", async () => {
    await GET();

    expect(mocks.listActiveFacts).toHaveBeenCalledWith({
      userId: "user-1",
      limit: 64,
    });
  });
});
