import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn(),
  clerkClient: vi.fn(),
  userFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  preferencesUpsert: vi.fn(),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    $queryRaw: mocks.queryRaw,
    profile: {
      findUnique: mocks.profileFindUnique,
      upsert: mocks.profileUpsert,
    },
    preferences: {
      upsert: mocks.preferencesUpsert,
    },
  },
}));

import {
  createUserContextTools,
  formatTinyUserSnapshotForPrompt,
  formatUserContextForPrompt,
} from "./user-context";

describe("ai/tools/user-context", () => {
  beforeEach(() => {
    mocks.tool.mockReset();
    mocks.tool.mockImplementation((definition) => definition);
    mocks.clerkClient.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.queryRaw.mockReset();
    mocks.profileFindUnique.mockReset();
    mocks.profileUpsert.mockReset();
    mocks.preferencesUpsert.mockReset();
  });

  it("getUserContext returns user profile and preferences", async () => {
    const userId = "user-ctx-1";
    mocks.userFindUnique.mockResolvedValue({
      id: userId,
      email: "user@example.test",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      profile: {
        name: "Tommaso",
        sport: "Running",
        goal: "Sub-40 10k",
        experience: "Intermediate",
        birthday: null,
        notes: null,
      },
      preferences: {
        tone: "direct",
        mode: "concise",
        language: "EN",
        push: true,
      },
    });

    const tools = createUserContextTools(userId);
    type GetCtxResult = { success: boolean; data: unknown };
    const getCtxExec = tools.getUserContext.execute as unknown as (
      args: object,
    ) => Promise<GetCtxResult>;
    const result = await getCtxExec({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      email: "user@example.test",
      profile: {
        name: "Tommaso",
        sport: "Running",
      },
      preferences: {
        tone: "direct",
        mode: "concise",
        language: "EN",
      },
    });
  });

  it("updatePreferences rejects empty arguments", async () => {
    const tools = createUserContextTools("user-ctx-2");
    type PrefResult = { success: boolean; message: string };
    const prefExec = tools.updatePreferences.execute as unknown as (
      args: object,
    ) => Promise<PrefResult>;
    const result = await prefExec({});

    expect(result.success).toBe(false);
    expect(result.message).toContain("Nessun parametro");
    expect(mocks.preferencesUpsert).not.toHaveBeenCalled();
  });

  it("updateProfile syncs name to Clerk when clerkId is available", async () => {
    const updateUser = vi.fn().mockResolvedValue(undefined);
    mocks.clerkClient.mockResolvedValue({
      users: {
        updateUser,
      },
    });
    mocks.profileUpsert.mockResolvedValue({ id: "profile-1" });
    mocks.userFindUnique.mockResolvedValue({
      clerkId: "clerk-123",
    });

    const tools = createUserContextTools("user-ctx-3");
    type ProfileResult = { success: boolean; message: string };
    const profileExec = tools.updateProfile.execute as unknown as (
      args: object,
    ) => Promise<ProfileResult>;
    const result = await profileExec({
      name: "Jane Doe",
      sport: "Tennis",
    });

    expect(result.success).toBe(true);
    expect(mocks.profileUpsert).toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith("clerk-123", {
      firstName: "Jane",
      lastName: "Doe",
    });
  });

  it("formatUserContextForPrompt caches output and updatePreferences invalidates it", async () => {
    const userId = "user-ctx-cache";
    mocks.queryRaw.mockResolvedValue([
      {
        profileName: "Cache User",
        profileSport: "Cycling",
        profileGoal: "FTP +20W",
        profileExperience: "Intermediate",
        profileBirthday: null,
        profileNotes: "Prefers short sessions.",
        preferenceTone: "technical",
        preferenceMode: "concise",
        preferenceLanguage: "EN",
      },
    ]);
    mocks.preferencesUpsert.mockResolvedValue({ id: "pref-1" });

    const first = await formatUserContextForPrompt(userId);
    const second = await formatUserContextForPrompt(userId);

    expect(first).toContain("Cache User");
    expect(second).toContain("Cache User");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);

    const tools = createUserContextTools(userId);
    const prefExec2 = tools.updatePreferences.execute as unknown as (
      args: object,
    ) => Promise<unknown>;
    await prefExec2({ tone: "direct" });
    await formatUserContextForPrompt(userId);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });

  it("loads the full prompt context through one projected query", async () => {
    const userId = "user-ctx-projected";
    mocks.queryRaw.mockResolvedValue([
      {
        profileName: "Projected User",
        profileSport: "Tennis",
        profileGoal: "Servizio più stabile",
        profileExperience: "Intermediate",
        profileBirthday: null,
        profileNotes: "Nota breve",
        preferenceTone: "direct",
        preferenceMode: "concise",
        preferenceLanguage: "it",
      },
    ]);

    const context = await formatUserContextForPrompt(userId);

    expect(context).toContain("Projected User");
    expect(context).toContain("Tennis");
    expect(context).toContain("Servizio più stabile");
    expect(context).toContain("Nota breve");
    expect(context).toContain("Lingua**: it");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("formatTinyUserSnapshotForPrompt returns compact coaching fields and caches them", async () => {
    const userId = "user-snapshot-cache";
    mocks.queryRaw.mockResolvedValue([
      {
        profileName: "Snapshot User",
        profileSport: "Tennis",
        profileGoal: "Serve più stabile",
        profileExperience: "Intermediate",
        profileBirthday: null,
        profileNotes:
          "Long private note that should not enter the tiny snapshot.",
        preferenceTone: "direct",
        preferenceMode: "concise",
        preferenceLanguage: "it",
        memoryKey: null,
        memoryValue: null,
      },
    ]);

    const first = await formatTinyUserSnapshotForPrompt(userId);
    const second = await formatTinyUserSnapshotForPrompt(userId);

    expect(first).toBe(
      "Lingua: it\nSport: Tennis\nObiettivo: Serve più stabile\nTono: direct\nModalità: concise",
    );
    expect(second).toBe(first);
    expect(first).not.toContain("Snapshot User");
    expect(first).not.toContain("Long private note");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("formatTinyUserSnapshotForPrompt includes compact saved memories for first-turn personalization", async () => {
    const userId = "user-snapshot-memories";
    mocks.queryRaw.mockResolvedValue([
      {
        profileName: null,
        profileSport: null,
        profileGoal: null,
        profileExperience: null,
        profileBirthday: null,
        profileNotes: null,
        preferenceTone: null,
        preferenceMode: null,
        preferenceLanguage: "it",
        memoryKey: null,
        memoryValue: null,
      },
      {
        profileName: null,
        profileSport: null,
        profileGoal: null,
        profileExperience: null,
        profileBirthday: null,
        profileNotes: null,
        preferenceTone: null,
        preferenceMode: null,
        preferenceLanguage: "it",
        memoryKey: "role",
        memoryValue: {
          content: "giocatore",
          category: "identity",
          confidence: 1,
        },
      },
    ]);

    const snapshot = await formatTinyUserSnapshotForPrompt(userId);

    expect(snapshot).toContain("Lingua: it");
    expect(snapshot).toContain("Memoria role: giocatore");
    expect(snapshot).not.toContain("favorite_quote");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});
