import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";
import {
  formatMemoriesForPrompt,
  invalidateMemoriesForPromptCache,
} from "./memory";
import {
  formatTinyUserSnapshotForPrompt,
  formatUserContextForPrompt,
  invalidateUserContextPromptCache,
} from "./user-context";

describe("integration ai/tools/user-context", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
  });

  it("loads projected profile, preferences, and compact memories from PostgreSQL", async () => {
    const user = await createUser();
    await prisma.profile.create({
      data: {
        userId: user.id,
        name: "Contesto reale",
        sport: "Tennis",
        goal: "Servizio più stabile",
        experience: "Intermediate",
        notes: "Nota privata",
      },
    });
    await prisma.preferences.create({
      data: {
        userId: user.id,
        tone: "direct",
        mode: "concise",
        language: "it",
      },
    });
    await prisma.memory.create({
      data: {
        userId: user.id,
        key: "sport_role",
        category: "identity",
        value: { content: "giocatore" },
      },
    });

    invalidateUserContextPromptCache(user.id);
    await expect(formatUserContextForPrompt(user.id)).resolves.toContain(
      "Contesto reale",
    );
    await expect(formatTinyUserSnapshotForPrompt(user.id)).resolves.toBe(
      "Lingua: it\nSport: Tennis\nObiettivo: Servizio più stabile\nTono: direct\nModalità: concise\nMemoria sport role: giocatore",
    );
  });

  it("does not expose prompt context for a soft-deleted user", async () => {
    const user = await createUser();
    await prisma.profile.create({
      data: { userId: user.id, name: "Da non leggere" },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });

    invalidateUserContextPromptCache(user.id);
    await expect(formatUserContextForPrompt(user.id)).resolves.toBe("");
    await expect(formatTinyUserSnapshotForPrompt(user.id)).resolves.toBe("");
  });

  it("loads a bounded recent memory prompt projection", async () => {
    const user = await createUser();
    await prisma.memory.createMany({
      data: Array.from({ length: 18 }, (_, index) => ({
        userId: user.id,
        key: `memory_${index}`,
        category: index % 2 === 0 ? "goal" : "sport",
        value: { content: `Contenuto ${index}` },
        updatedAt: new Date(
          `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        ),
      })),
    });

    invalidateMemoriesForPromptCache(user.id);
    const prompt = await formatMemoriesForPrompt(user.id);

    expect(prompt).toContain("Contenuto 17");
    expect(prompt).toContain("Contenuto 2");
    expect(prompt).not.toMatch(/- \*\*memory 1\*\*:/);
  });
});
