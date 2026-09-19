import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import { undoMemoryRevision } from "./memory-changes";
import { consolidateTurnMemory } from "./memory-consolidator";
import { extractMemoryCandidates } from "./memory-extractor";
import { rememberFact } from "./memory-facts";
import { memoryValueRevisionId } from "./memory-revision";
import { requestTypedDecisions } from "./typed-decisions";

vi.mock("./memory-extractor", () => ({ extractMemoryCandidates: vi.fn() }));
vi.mock("./typed-decisions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./typed-decisions")>()),
  requestTypedDecisions: vi.fn(),
}));
vi.mock("./usage-meter", () => ({ scheduleTypedDecisionUsage: vi.fn() }));

async function fixture() {
  const owner = await createUser();
  const chat = await createChat(owner.id);
  const original = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text: "Mi alleno martedì sera.",
    createdAt: new Date("2026-08-01T09:00:00Z"),
  });
  const originalInput = {
    userId: owner.id,
    key: "training_schedule",
    value: "Mi alleno martedì sera",
    category: "schedule",
    confidence: 0.96,
    sensitivity: "LOW" as const,
    origin: "EXPLICIT" as const,
    sourceMessageId: original.id,
    sourceThreadId: original.conversationThreadId ?? undefined,
    observedAt: original.createdAt,
    expiresAt: new Date("2099-08-01T09:00:00Z"),
    dedupeKey: `memory:${original.id}:initial`,
  };
  const saved = await rememberFact(originalInput);
  expect(saved.status).toBe("saved");
  const memory = await prisma.memory.findUniqueOrThrow({
    where: { id: saved.factId },
  });
  const text = "Correggi: ora mi alleno giovedì mattina, non martedì sera";
  const correction = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text,
  });
  vi.stubEnv("AI_MEMORY_REVIEW_MODE", "active");
  vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", owner.id);
  vi.mocked(extractMemoryCandidates).mockResolvedValue([
    {
      key: "weekly_training",
      value: "Mi alleno giovedì mattina",
      category: "schedule",
      confidence: 0.99,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      explicitSetting: false,
      durability: "DURABLE",
      evidence: text,
      subject: "ACCOUNT_HOLDER",
      subjectName: null,
      subjectRelationship: null,
    },
  ]);
  const input = {
    userId: owner.id,
    inboundMessageId: correction.id,
    conversationThreadId: correction.conversationThreadId ?? undefined,
    userText: text,
    assistantText: "Ricevuto.",
  };
  return { owner, originalInput, memory, input };
}

function reviewResponse(questions: Record<string, unknown>) {
  return {
    ok: true as const,
    attempted: true,
    modelId: "typesafe/jev-1.13",
    durationMs: 5,
    answers: Object.fromEntries(
      Object.keys(questions).map((key) => [
        key,
        {
          choice: key.startsWith("match_")
            ? "correction"
            : key.startsWith("sensitivity_")
              ? "ordinary"
              : "supported",
          confidence: 0.99,
        },
      ]),
    ),
  };
}

describe("integration Jev semantic memory mutations", () => {
  beforeEach(resetIntegrationDb);
  afterEach(() => vi.unstubAllEnvs());

  it("corrects the existing stable fact and undo restores original content, source and expiry", async () => {
    const { owner, memory, input } = await fixture();
    vi.mocked(requestTypedDecisions).mockImplementation(async ({ questions }) =>
      reviewResponse(questions),
    );
    expect(await consolidateTurnMemory(input)).toEqual({
      considered: 1,
      persisted: 1,
      approvalsCreated: 0,
      rejected: 0,
    });
    const updated = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    expect(updated).toMatchObject({
      id: memory.id,
      key: "training_schedule",
      expiresAt: null,
      sourceMessageId: input.inboundMessageId,
      value: expect.objectContaining({ content: "Mi alleno giovedì mattina" }),
    });
    expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(1);
    const revisionId = memoryValueRevisionId(updated.value);
    expect(revisionId).toBeDefined();
    const revision = await prisma.memoryRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(revision.previousValue).toMatchObject({
      content: "Mi alleno martedì sera",
      _undoState: expect.objectContaining({
        expiresAt: memory.expiresAt?.toISOString(),
        sourceMessageId: memory.sourceMessageId,
      }),
    });
    expect(await undoMemoryRevision(owner.id, memory.id, revision.id)).toBe(
      "undone",
    );
    expect(
      await prisma.memory.findUniqueOrThrow({ where: { id: memory.id } }),
    ).toMatchObject({
      key: memory.key,
      expiresAt: memory.expiresAt,
      observedAt: memory.observedAt,
      sourceMessageId: memory.sourceMessageId,
      value: expect.objectContaining({ content: "Mi alleno martedì sera" }),
    });
  });

  it("rejects a target changed during the model call without creating the candidate's alternate key", async () => {
    const { owner, memory, input, originalInput } = await fixture();
    vi.mocked(requestTypedDecisions).mockImplementation(
      async ({ questions }) => {
        const concurrent = await rememberFact({
          ...originalInput,
          value: "Mi alleno sabato",
          dedupeKey: `concurrent:${memory.id}`,
        });
        expect(concurrent.status).toBe("saved");
        return reviewResponse(questions);
      },
    );
    expect(await consolidateTurnMemory(input)).toEqual({
      considered: 1,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 1,
    });
    const current = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    expect(current.updatedAt.getTime()).toBeGreaterThan(
      memory.updatedAt.getTime(),
    );
    expect(current.value).toMatchObject({ content: "Mi alleno sabato" });
    expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(1);
    expect(
      await prisma.memory.count({
        where: { userId: owner.id, key: "weekly_training" },
      }),
    ).toBe(0);
    expect(
      await prisma.memoryRevision.count({ where: { memoryId: memory.id } }),
    ).toBe(2);
  });
});
