import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  userFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  preferencesUpsert: vi.fn(),
  invalidateUserContextPromptCache: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    profile: { upsert: mocks.profileUpsert },
    preferences: { upsert: mocks.preferencesUpsert },
  },
}));

vi.mock("@/lib/ai/tools/user-context-cache", () => ({
  invalidateUserContextPromptCache: mocks.invalidateUserContextPromptCache,
}));

import {
  updateCanonicalPreferences,
  updateCanonicalProfile,
} from "./user-knowledge";

describe("ai/user-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the canonical profile and invalidates prompt caches", async () => {
    mocks.profileUpsert.mockResolvedValue({ id: "profile-1" });

    const profile = await updateCanonicalProfile("user-1", {
      sport: "Tennis",
      goal: "Serve più stabile",
    });

    expect(profile).toEqual({ id: "profile-1" });
    expect(mocks.profileUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: { sport: "Tennis", goal: "Serve più stabile" },
      create: {
        userId: "user-1",
        sport: "Tennis",
        goal: "Serve più stabile",
      },
    });
    expect(mocks.invalidateUserContextPromptCache).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("syncs a canonical profile name to Clerk without failing the database write", async () => {
    const updateUser = vi
      .fn()
      .mockRejectedValue(new Error("Clerk unavailable"));
    mocks.profileUpsert.mockResolvedValue({ id: "profile-2" });
    mocks.userFindUnique.mockResolvedValue({ clerkId: "clerk-1" });
    mocks.clerkClient.mockResolvedValue({ users: { updateUser } });

    await expect(
      updateCanonicalProfile("user-2", { name: "Jane Doe" }),
    ).resolves.toEqual({ id: "profile-2" });
    expect(updateUser).toHaveBeenCalledWith("clerk-1", {
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(mocks.invalidateUserContextPromptCache).toHaveBeenCalledWith(
      "user-2",
    );
  });

  it("updates canonical preferences including false push values", async () => {
    mocks.preferencesUpsert.mockResolvedValue({ id: "preferences-1" });

    const preferences = await updateCanonicalPreferences("user-3", {
      language: "EN",
      push: false,
    });

    expect(preferences).toEqual({ id: "preferences-1" });
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith({
      where: { userId: "user-3" },
      update: { language: "EN", push: false },
      create: {
        userId: "user-3",
        language: "EN",
        push: false,
      },
    });
    expect(mocks.invalidateUserContextPromptCache).toHaveBeenCalledWith(
      "user-3",
    );
  });
});
