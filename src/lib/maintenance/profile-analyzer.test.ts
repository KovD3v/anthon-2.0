import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  messageFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  maintenanceModel: "maintenance-model",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findMany: mocks.messageFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

import { analyzeUserProfile } from "./profile-analyzer";

function buildMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i + 1}`,
    content: `message-${i + 1}`,
    createdAt: new Date(`2026-02-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`),
  }));
}

describe("maintenance/profile-analyzer", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.transaction.mockReset();

    mocks.outputObject.mockReturnValue({ schema: "mocked" });
  });

  it("returns early when there are fewer than 10 user messages", async () => {
    mocks.messageFindMany.mockResolvedValue(buildMessages(9));

    await analyzeUserProfile("user-1");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns when AI output is null", async () => {
    mocks.messageFindMany.mockResolvedValue(buildMessages(10));
    mocks.generateText.mockResolvedValue({ output: null });

    await analyzeUserProfile("user-1");

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates preferences and profile fields from analysis output", async () => {
    mocks.messageFindMany.mockResolvedValue(buildMessages(10));
    mocks.generateText.mockResolvedValue({
      output: {
        tone: "friendly",
        mode: "coaching",
        newNotes: "Prefers concise plans",
        updates: {
          sport: "tennis",
          goal: null,
          experience: "intermediate",
        },
      },
    });

    const tx = {
      preferences: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      profile: {
        findUnique: vi.fn().mockResolvedValue({ notes: "Existing note" }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.transaction.mockImplementation(
      async (fn: (client: typeof tx) => Promise<unknown>) => await fn(tx),
    );

    await analyzeUserProfile("user-1");

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "maintenance-model",
        prompt: expect.stringContaining("message-10"),
      }),
    );

    expect(tx.preferences.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        tone: "friendly",
        mode: "coaching",
      },
      create: {
        userId: "user-1",
        tone: "friendly",
        mode: "coaching",
      },
    });

    expect(tx.profile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        sport: "tennis",
        experience: "intermediate",
        notes: "Existing note\n- Prefers concise plans",
      },
      create: {
        userId: "user-1",
        sport: "tennis",
        experience: "intermediate",
        notes: "Existing note\n- Prefers concise plans",
      },
    });
  });

  it("catches AI errors and does not throw", async () => {
    mocks.messageFindMany.mockResolvedValue(buildMessages(12));
    mocks.generateText.mockRejectedValue(new Error("ai unavailable"));

    await expect(analyzeUserProfile("user-1")).resolves.toBeUndefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
