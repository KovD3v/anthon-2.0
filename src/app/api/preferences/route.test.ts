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

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      preferences: {
        userId: "user-1",
        voiceEnabled: false,
        tone: "friendly",
        mode: "coach",
        language: "EN",
        push: false,
        showTechnicalMetrics: null,
      },
    });
    mocks.preferencesUpsert.mockResolvedValue({
      userId: "user-1",
      voiceEnabled: true,
      tone: "direct",
      mode: "teacher",
      language: "IT",
      push: true,
      showTechnicalMetrics: null,
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
      showTechnicalMetrics: null,
      effectiveShowTechnicalMetrics: false,
    });
  });

  it("GET falls back to defaults when preferences are missing", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      preferences: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      voiceEnabled: true,
      tone: null,
      mode: null,
      language: "IT",
      push: true,
      showTechnicalMetrics: null,
      effectiveShowTechnicalMetrics: false,
    });
  });

  it.each([
    ["ADMIN", true],
    ["SUPER_ADMIN", true],
  ] as const)(
    "GET applies the role default when an %s user has no preferences",
    async (role, effectiveShowTechnicalMetrics) => {
      mocks.getAuthUser.mockResolvedValue({
        user: { id: "user-1", role },
        error: null,
      });
      mocks.userFindUnique.mockResolvedValue({
        id: "user-1",
        role,
        preferences: null,
      });

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        showTechnicalMetrics: null,
        effectiveShowTechnicalMetrics,
      });
    },
  );

  it("GET returns an explicit override instead of the admin default", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "ADMIN" },
      error: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "ADMIN",
      preferences: {
        userId: "user-1",
        voiceEnabled: false,
        tone: "friendly",
        mode: "coach",
        language: "EN",
        push: false,
        showTechnicalMetrics: false,
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      showTechnicalMetrics: false,
      effectiveShowTechnicalMetrics: false,
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
        showTechnicalMetrics: null,
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
        showTechnicalMetrics: null,
      },
    });
  });

  it("PATCH stores an explicit technical-metrics override", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ showTechnicalMetrics: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: { showTechnicalMetrics: true },
      create: {
        userId: "user-1",
        voiceEnabled: true,
        tone: null,
        mode: null,
        language: "IT",
        push: true,
        showTechnicalMetrics: true,
      },
    });
  });

  it("PATCH stores a null technical-metrics override", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ showTechnicalMetrics: null }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { showTechnicalMetrics: null },
        create: expect.objectContaining({ showTechnicalMetrics: null }),
      }),
    );
  });

  it.each([
    { voiceEnabled: "true" },
    { push: "false" },
    { tone: 123 },
    { mode: false },
    { language: false },
    { showTechnicalMetrics: "true" },
  ])("PATCH returns 400 for invalid preference types: %o", async (body) => {
    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Preferenze non valide",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.preferencesUpsert).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 for unknown preference keys", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ unknown: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Preferenze non valide",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.preferencesUpsert).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 on malformed JSON", async () => {
    const response = await PATCH({
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corpo richiesta non valido",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.preferencesUpsert).not.toHaveBeenCalled();
  });

  it("PATCH returns 500 on persistence errors", async () => {
    mocks.preferencesUpsert.mockRejectedValue(new Error("db failed"));

    const response = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ tone: "direct" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Errore interno del server",
    });
  });
});
