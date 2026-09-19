import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import {
  listActiveFacts,
  recallFacts,
  rememberFact,
  reviseFact,
} from "./memory-facts";
import { formatMemoriesForPrompt } from "./tools/memory";
import { formatTinyUserSnapshotForPrompt } from "./tools/user-context";

describe("integration temporary contextual memory", () => {
  beforeEach(resetIntegrationDb);
  afterEach(() => vi.useRealTimers());

  it("expires warm recall and prompt caches, then replaces and clears expiry through real revisions", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const chat = await createChat(owner.id);
    const source = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Consegna progetto venerdì",
      metadata: { timeZone: "Europe/Rome" },
    });
    const expiresAt = new Date(Date.now() + 3_600_000);
    const input = {
      userId: owner.id,
      key: "work_deadline",
      value: "Consegna progetto venerdì",
      category: "schedule",
      confidence: 1,
      sensitivity: "LOW" as const,
      origin: "EXPLICIT" as const,
      sourceMessageId: source.id,
      sourceThreadId: source.conversationThreadId ?? undefined,
      observedAt: source.createdAt,
      expiresAt,
      dedupeKey: `memory:${source.id}:initial`,
    };
    const saved = await rememberFact(input);
    expect(saved.status).toBe("saved");
    if (!saved.factId) throw new Error("Saved fact has no id");
    const factId = saved.factId;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(expiresAt.getTime() - 1_000));
    expect(
      (await recallFacts({ userId: owner.id, query: "progetto" })).facts,
    ).toHaveLength(1);
    expect(
      (await recallFacts({ userId: stranger.id, query: "progetto" })).facts,
    ).toEqual([]);
    expect(await formatMemoriesForPrompt(owner.id)).toContain(
      "Consegna progetto",
    );
    expect(await formatTinyUserSnapshotForPrompt(owner.id)).toContain(
      "Consegna progetto",
    );

    vi.setSystemTime(expiresAt);
    expect(
      (await recallFacts({ userId: owner.id, query: "progetto" })).facts,
    ).toEqual([]);
    expect((await listActiveFacts({ userId: owner.id })).facts).toEqual([]);
    expect(await formatMemoriesForPrompt(owner.id)).not.toContain(
      "Consegna progetto",
    );
    expect(await formatTinyUserSnapshotForPrompt(owner.id)).not.toContain(
      "Consegna progetto",
    );

    const replacementExpiry = new Date(expiresAt.getTime() + 86_400_000);
    expect(
      (
        await reviseFact({
          ...input,
          factId,
          value: "Consegna spostata",
          expiresAt: replacementExpiry,
          dedupeKey: `memory:${source.id}:postpone`,
        })
      ).status,
    ).toBe("saved");
    expect(
      (await recallFacts({ userId: owner.id, query: "consegna" })).facts[0]
        ?.expiresAt,
    ).toEqual(replacementExpiry);
    expect(
      (
        await reviseFact({
          ...input,
          factId,
          value: "Il progetto è un obiettivo continuativo",
          expiresAt: null,
          dedupeKey: `memory:${source.id}:durable`,
        })
      ).status,
    ).toBe("saved");
    vi.setSystemTime(new Date(replacementExpiry.getTime() + 1));
    expect(
      (await recallFacts({ userId: owner.id, query: "progetto" })).facts[0]
        ?.content,
    ).toBe("Il progetto è un obiettivo continuativo");
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: factId } }))
        .expiresAt,
    ).toBeNull();
    expect(
      await prisma.memoryRevision.count({ where: { memoryId: factId } }),
    ).toBe(3);
  });
});
