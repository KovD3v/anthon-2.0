import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  userFindUnique: vi.fn(),
  preferencesUpsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    preferences: {
      upsert: mocks.preferencesUpsert,
    },
  },
}));

import { GET, PATCH } from "./route";

describe("/api/preferences route", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.preferencesUpsert.mockReset();

    mocks.getAuthUser.mockResolvedValue({ user: { id: "user-1" }, error: null });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      preferences: {
        userId: "user-1",
        voiceEnabled: false,
        tone: "friendly",
        mode: "coach",
        language: "EN",
        push: false,
      },
    });
    mocks.preferencesUpsert.mockResolvedValue({
      userId: "user-1",
      voiceEnabled: true,
      tone: "direct",
      mode: "teacher",
      language: "IT",
      push: true,
    });
  });

  it("GET returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns 404 when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Utente non trovato",
    });
  });

  it("GET returns saved preferences", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: { preferences: true },
    });
    await expect(response.json()).resolves.toEqual({
      userId: "user-1",
      voiceEnabled: false,
      tone: "friendly",
      mode: "coach",
      language: "EN",
      push: false,
    });
  });

  it("GET falls back to defaults when preferences are missing", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", preferences: null });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      voiceEnabled: true,
      tone: null,
      mode: null,
      language: "IT",
      push: true,
    });
  });

  it("GET returns 500 on unexpected errors", async () => {
    mocks.userFindUnique.mockRejectedValue(new Error("db failed"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Errore interno del server",
    });
  });

  it("PATCH returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "No auth" });

    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ tone: "direct" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "No auth" });
  });

  it("PATCH returns 404 when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ tone: "direct" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Utente non trovato",
    });
  });

  it("PATCH upserts with only provided fields in update payload", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ language: "EN", push: false }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        language: "EN",
        push: false,
      },
      create: {
        userId: "user-1",
        voiceEnabled: true,
        tone: null,
        mode: null,
        language: "EN",
        push: false,
      },
    });
  });

  it("PATCH uses create defaults when payload omits fields", async () => {
    await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(mocks.preferencesUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {},
      create: {
        userId: "user-1",
        voiceEnabled: true,
        tone: null,
        mode: null,
        language: "IT",
        push: true,
      },
    });
  });

  it("PATCH returns 500 on parsing or persistence errors", async () => {
    const response = await PATCH({
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Errore interno del server",
    });
  });
});
