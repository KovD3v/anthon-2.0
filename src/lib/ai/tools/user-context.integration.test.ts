import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";
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
});
