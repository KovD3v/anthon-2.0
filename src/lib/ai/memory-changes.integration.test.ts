import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import { getTurnMemoryChanges, undoMemoryRevision } from "./memory-changes";
import { listActiveFacts, rememberFact, reviseFact } from "./memory-facts";
import { memoryValueRevisionId } from "./memory-revision";

async function fixture() {
  const owner = await createUser();
  const chat = await createChat(owner.id);
  const source = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text: "Luca si allena martedì.",
  });
  const input = {
    userId: owner.id,
    sourceMessageId: source.id,
    sourceThreadId: source.conversationThreadId ?? undefined,
    key: "luca_training_schedule",
    value: "Luca si allena martedì.",
    category: "schedule",
    origin: "CONFIRMED" as const,
    sensitivity: "HIGH" as const,
    confidence: 0.9,
    observedAt: new Date("2026-08-01T09:00:00Z"),
    expiresAt: new Date("2099-08-01T09:00:00Z"),
    dedupeKey: `memory:${source.id}:initial`,
  };
  const result = await rememberFact(input);
  expect(result.status).toBe("saved");
  const memory = await prisma.memory.findUniqueOrThrow({
    where: { id: result.factId },
  });
  const revisionId = memoryValueRevisionId(memory.value) ?? "missing-revision";
  return { owner, chat, source, memory, revisionId, input };
}

describe("integration turn memory changes and undo", () => {
  beforeEach(resetIntegrationDb);

  it("undoes a saved fact once, including concurrent repeated requests, and invalidates recall", async () => {
    const { owner, chat, source, memory, revisionId } = await fixture();
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [source.id])).get(
        source.id,
      ),
    ).toEqual([
      {
        memoryId: memory.id,
        revisionId,
        content: "Luca si allena martedì.",
        kind: "saved",
        canUndo: true,
      },
    ]);
    expect((await listActiveFacts({ userId: owner.id })).facts).toHaveLength(1);
    expect(
      await Promise.all([
        undoMemoryRevision(owner.id, memory.id, revisionId),
        undoMemoryRevision(owner.id, memory.id, revisionId),
      ]),
    ).toEqual(["undone", "undone"]);
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "undone",
    );
    expect((await listActiveFacts({ userId: owner.id })).facts).toHaveLength(0);
    expect(
      await prisma.memoryRevision.count({
        where: { memoryId: memory.id, reason: "undo" },
      }),
    ).toBe(1);
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [source.id])).size,
    ).toBe(0);
  });

  it("restores an updated fact's attribution, confirmation and expiry without reverting a newer revision", async () => {
    const { owner, chat, source, memory, revisionId, input } = await fixture();
    const updateSource = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Luca si allena giovedì.",
    });
    const updated = await reviseFact({
      ...input,
      factId: memory.id,
      sourceMessageId: updateSource.id,
      value: "Luca si allena giovedì.",
      sensitivity: "LOW",
      origin: "EXPLICIT",
      confidence: 1,
      expiresAt: null,
      dedupeKey: `memory:${updateSource.id}:update`,
    });
    expect(updated.status).toBe("saved");
    const revised = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    const updatedRevisionId =
      memoryValueRevisionId(revised.value) ?? "missing-revision";
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [updateSource.id])).get(
        updateSource.id,
      )?.[0]?.kind,
    ).toBe("updated");
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "stale",
    );
    expect(
      await undoMemoryRevision(owner.id, memory.id, updatedRevisionId),
    ).toBe("undone");
    const restored = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    expect(restored).toMatchObject({
      key: memory.key,
      category: memory.category,
      status: "ACTIVE",
      origin: "CONFIRMED",
      sensitivity: "HIGH",
      confidence: 0.9,
      sourceMessageId: source.id,
      sourceThreadId: source.conversationThreadId,
      observedAt: memory.observedAt,
      lastConfirmedAt: memory.lastConfirmedAt,
      expiresAt: memory.expiresAt,
      value: expect.objectContaining({ content: "Luca si allena martedì." }),
    });
    expect(memoryValueRevisionId(restored.value)).not.toBe(revisionId);
    await reviseFact({
      ...input,
      factId: memory.id,
      value: "Luca si allena sabato.",
      dedupeKey: `memory:${updateSource.id}:newer`,
    });
    expect(
      await undoMemoryRevision(owner.id, memory.id, updatedRevisionId),
    ).toBe("undone");
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: memory.id } }))
        .value,
    ).toMatchObject({ content: "Luca si allena sabato." });
  });

  it("isolates owner/private facts and refuses deleted source chats or messages", async () => {
    const { owner, chat, source, memory, revisionId } = await fixture();
    const other = await createUser();
    expect(
      (await getTurnMemoryChanges(other.id, chat.id, [source.id])).size,
    ).toBe(0);
    expect(await undoMemoryRevision(other.id, memory.id, revisionId)).toBe(
      "not_found",
    );
    await prisma.chat.update({
      where: { id: chat.id },
      data: { visibility: "PUBLIC" },
    });
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [source.id])).size,
    ).toBe(0);
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "not_found",
    );
    await prisma.chat.update({
      where: { id: chat.id },
      data: { visibility: "PRIVATE", deletedAt: new Date() },
    });
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "not_found",
    );
    await prisma.chat.update({
      where: { id: chat.id },
      data: { deletedAt: null },
    });
    await prisma.message.update({
      where: { id: source.id },
      data: { deletedAt: new Date() },
    });
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "not_found",
    );
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: memory.id } }))
        .status,
    ).toBe("ACTIVE");
  });

  it("waits for same-turn consolidation before exposing undoable changes", async () => {
    const { owner, chat, source, memory, revisionId } = await fixture();
    const assistant = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      role: "ASSISTANT",
      metadata: { memoryConsolidation: "pending" },
    });
    await prisma.message.update({
      where: { id: assistant.id },
      data: { sourceInboundMessageId: source.id },
    });
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [source.id])).size,
    ).toBe(0);
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "pending",
    );
    await prisma.message.update({
      where: { id: assistant.id },
      data: {
        metadata: {
          memoryConsolidation: "completed",
        } as Prisma.InputJsonObject,
      },
    });
    expect(
      (await getTurnMemoryChanges(owner.id, chat.id, [source.id])).get(
        source.id,
      ),
    ).toHaveLength(1);
    expect(await undoMemoryRevision(owner.id, memory.id, revisionId)).toBe(
      "undone",
    );
  });

  it("serializes concurrent first saves so undo restores the immediately preceding fact", async () => {
    const owner = await createUser();
    const chat = await createChat(owner.id);
    const sources = await Promise.all([
      createMessage({ userId: owner.id, chatId: chat.id, text: "Martedì" }),
      createMessage({ userId: owner.id, chatId: chat.id, text: "Giovedì" }),
    ]);
    const results = await Promise.all(
      sources.map((source, index) =>
        rememberFact({
          userId: owner.id,
          key: "training_schedule",
          value: index ? "Giovedì" : "Martedì",
          category: "schedule",
          origin: "EXPLICIT",
          sensitivity: "LOW",
          confidence: 1,
          sourceMessageId: source.id,
          sourceThreadId: source.conversationThreadId ?? undefined,
          dedupeKey: `concurrent:${source.id}`,
        }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual(["saved", "saved"]);
    expect(results[0].factId).toBe(results[1].factId);
    const memory = await prisma.memory.findUniqueOrThrow({
      where: { id: results[0].factId },
    });
    const currentRevisionId =
      memoryValueRevisionId(memory.value) ?? "missing-revision";
    const previousRevision = await prisma.memoryRevision.findFirstOrThrow({
      where: { memoryId: memory.id, id: { not: currentRevisionId } },
    });
    expect(
      await undoMemoryRevision(owner.id, memory.id, currentRevisionId),
    ).toBe("undone");
    const restored = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.value).toMatchObject({
      content: (previousRevision.nextValue as { content: string }).content,
    });
    expect(restored.sourceMessageId).toBe(previousRevision.sourceMessageId);
  });
});
