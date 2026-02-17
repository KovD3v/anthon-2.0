import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn(),
  clerkClient: vi.fn(),
  userFindUnique: vi.fn(),
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
    profile: {
      findUnique: mocks.profileFindUnique,
      upsert: mocks.profileUpsert,
    },
    preferences: {
      upsert: mocks.preferencesUpsert,
    },
  },
}));

import { createUserContextTools, formatUserContextForPrompt } from "./user-context";

describe("ai/tools/user-context", () => {
  beforeEach(() => {
    mocks.tool.mockReset();
    mocks.tool.mockImplementation((definition) => definition);
    mocks.clerkClient.mockReset();
    mocks.userFindUnique.mockReset();
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
    const result = await tools.getUserContext.execute({});

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
    const result = await tools.updatePreferences.execute({});

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
    const result = await tools.updateProfile.execute({
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
    mocks.userFindUnique.mockResolvedValue({
      id: userId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      profile: {
        name: "Cache User",
        sport: "Cycling",
        goal: "FTP +20W",
        experience: "Intermediate",
        birthday: null,
        notes: "Prefers short sessions.",
      },
      preferences: {
        tone: "technical",
        mode: "concise",
        language: "EN",
        push: true,
      },
    });
    mocks.preferencesUpsert.mockResolvedValue({ id: "pref-1" });

    const first = await formatUserContextForPrompt(userId);
    const second = await formatUserContextForPrompt(userId);

    expect(first).toContain("Cache User");
    expect(second).toContain("Cache User");
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);

    const tools = createUserContextTools(userId);
    await tools.updatePreferences.execute({ tone: "direct" });
    await formatUserContextForPrompt(userId);

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(2);
  });
});
