import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import { undoMemoryRevision } from "./memory-changes";
import {
  getActiveFactById,
  listActiveFacts,
  type MemorySubject,
  recallFacts,
  rememberFact,
} from "./memory-facts";
import { memoryValueRevisionId } from "./memory-revision";

async function fixture() {
  const owner = await createUser();
  const chat = await createChat(owner.id);
  const source = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text: "Ada si allena il martedì.",
  });
  return {
    userId: owner.id,
    sourceMessageId: source.id,
    sourceThreadId: source.conversationThreadId ?? undefined,
    key: "sister_training",
    value: "Ada si allena il martedì.",
    category: "schedule",
    origin: "EXPLICIT" as const,
    sensitivity: "LOW" as const,
    confidence: 1,
    dedupeKey: `subject:${source.id}:initial`,
  };
}

describe("integration explicit memory subject metadata", () => {
  beforeEach(resetIntegrationDb);

  it.each<MemorySubject | undefined>([
    undefined,
    "ACCOUNT_HOLDER",
    "REFERENCED_PERSON",
  ])(
    "writes and recalls only the supplied attribution: %s",
    async (subject) => {
      const input = await fixture();
      const saved = await rememberFact({
        ...input,
        key: subject === undefined ? "person_ada_unverified" : input.key,
        subject,
      });
      expect(saved.status).toBe("saved");
      if (!saved.factId) throw new Error("Saved fact has no id");
      const stored = await prisma.memory.findUniqueOrThrow({
        where: { id: saved.factId },
      });
      expect((stored.value as { _subject?: unknown })._subject).toBe(subject);
      const read = await getActiveFactById({
        userId: input.userId,
        factId: saved.factId,
      });
      const recall = await recallFacts({
        userId: input.userId,
        query: "allenamento",
      });
      const list = await listActiveFacts({ userId: input.userId });
      for (const fact of [read, recall.facts[0], list.facts[0]]) {
        expect(fact?.subject).toBe(subject);
        expect(Object.hasOwn(fact ?? {}, "subject")).toBe(
          subject !== undefined,
        );
        expect(fact).not.toHaveProperty("_subject");
      }
    },
  );

  it("clears attribution on an unverified same-turn overwrite and restores it through undo and warm recall", async () => {
    const input = await fixture();
    const initial = await rememberFact({
      ...input,
      subject: "REFERENCED_PERSON",
    });
    expect(initial.status).toBe("saved");
    if (!initial.factId) throw new Error("Saved fact has no id");
    expect(
      (await recallFacts({ userId: input.userId, query: "Ada" })).facts[0]
        ?.subject,
    ).toBe("REFERENCED_PERSON");
    const rewritten = await rememberFact({
      ...input,
      dedupeKey: `${input.dedupeKey}:rewrite`,
    });
    expect(rewritten).toEqual({ status: "saved", factId: initial.factId });
    const current = await prisma.memory.findUniqueOrThrow({
      where: { id: initial.factId },
    });
    expect(current.value).not.toHaveProperty("_subject");
    expect(
      (await recallFacts({ userId: input.userId, query: "Ada" })).facts[0],
    ).not.toHaveProperty("subject");

    const revisionId = memoryValueRevisionId(current.value);
    if (!revisionId) throw new Error("Updated fact has no revision");
    expect(await undoMemoryRevision(input.userId, current.id, revisionId)).toBe(
      "undone",
    );
    const restored = await prisma.memory.findUniqueOrThrow({
      where: { id: current.id },
    });
    expect(restored.value).toMatchObject({
      content: input.value,
      _subject: "REFERENCED_PERSON",
    });
    expect(
      (await recallFacts({ userId: input.userId, query: "Ada" })).facts[0]
        ?.subject,
    ).toBe("REFERENCED_PERSON");
  });
});
