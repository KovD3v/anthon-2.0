import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import {
  getImmediatelyAttributableApproval,
  getUnpresentedMemoryApproval,
  markMemoryApprovalPresented,
  resolveMemoryApproval,
} from "./memory-approval";
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
          probability: 0.99,
        },
      ]),
    ),
  };
}

async function sensitiveFixture(factLifetimeMs = 60 * 60_000) {
  const owner = await createUser();
  const chat = await createChat(owner.id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + factLifetimeMs);
  const text = `Ho una distorsione al polso; il mio piano di recupero termina il ${expiresAt.toISOString()}.`;
  const source = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text,
    createdAt: new Date(now.getTime() - 6_000),
  });
  vi.stubEnv("AI_MEMORY_REVIEW_MODE", "active");
  vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", owner.id);
  vi.mocked(extractMemoryCandidates).mockResolvedValue([
    {
      key: "wrist_recovery_plan",
      value: text,
      category: "other",
      confidence: 0.99,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      explicitSetting: false,
      durability: "TEMPORARY",
      expiry: { expression: expiresAt.toISOString(), timeZone: null },
      evidence: text,
      subject: "ACCOUNT_HOLDER",
      subjectName: null,
      subjectRelationship: null,
    },
  ]);
  vi.mocked(requestTypedDecisions).mockImplementation(async ({ questions }) => {
    const response = reviewResponse(questions);
    response.answers.sensitivity_0 = {
      choice: "sensitive",
      confidence: 0.99,
      probability: 0.99,
    };
    return response;
  });
  expect(
    await consolidateTurnMemory({
      userId: owner.id,
      inboundMessageId: source.id,
      conversationThreadId: source.conversationThreadId ?? undefined,
      userText: text,
      assistantText: "Ricevuto.",
    }),
  ).toEqual({
    considered: 1,
    persisted: 0,
    approvalsCreated: 1,
    rejected: 0,
  });
  expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(0);
  const approval = await prisma.memoryApproval.findFirstOrThrow({
    where: { userId: owner.id, sourceInboundMessageId: source.id },
  });
  expect(approval).toMatchObject({
    status: "PENDING",
    presentationInboundMessageId: null,
    presentationAssistantMessageId: null,
    value: {
      content: text,
      _subject: "ACCOUNT_HOLDER",
      observedAt: source.createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  });
  return { owner, chat, source, approval, expiresAt, text, now };
}

async function presentSensitiveApproval(
  fixture: Awaited<ReturnType<typeof sensitiveFixture>>,
) {
  const { owner, chat, source, approval, now } = fixture;
  const conversationId = source.conversationThreadId;
  if (!conversationId) throw new Error("Synthetic source has no thread");
  expect(
    await getUnpresentedMemoryApproval({ userId: owner.id, conversationId }),
  ).toMatchObject({ id: approval.id });
  const inbound = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text: "Come organizzo la prossima prova?",
    createdAt: new Date(now.getTime() - 3_000),
  });
  const assistant = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    role: "ASSISTANT",
    text: "Vuoi salvare in memoria il piano di recupero al polso con la sua scadenza?",
    createdAt: new Date(now.getTime() - 2_000),
  });
  await prisma.message.update({
    where: { id: assistant.id },
    data: { sourceInboundMessageId: inbound.id },
  });
  expect(
    await markMemoryApprovalPresented({
      userId: owner.id,
      approvalId: approval.id,
      presentationInboundMessageId: inbound.id,
      presentationAssistantMessageId: assistant.id,
    }),
  ).toEqual({ status: "presented" });
  const confirmation = await createMessage({
    userId: owner.id,
    chatId: chat.id,
    text: "Sì, salvalo in memoria.",
    createdAt: new Date(now.getTime() - 1_000),
  });
  return { confirmation, conversationId };
}

describe("integration Jev semantic memory mutations", () => {
  beforeEach(resetIntegrationDb);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each(["timeout", "unsupported", "uncertain"] as const)(
    "does not save or revise facts after an active review %s",
    async (outcome) => {
      const { owner, memory, input } = await fixture();
      vi.mocked(requestTypedDecisions).mockImplementation(
        async ({ questions }) => {
          if (outcome === "timeout") {
            return {
              ok: false,
              attempted: true,
              modelId: "typesafe/jev-1.13",
              durationMs: 1500,
              failureCode: "timeout",
            };
          }
          const response = reviewResponse(questions);
          response.answers.support_0 = {
            choice: outcome,
            confidence: 0.22,
            probability: 0.4,
          };
          return response;
        },
      );
      expect(await consolidateTurnMemory(input)).toEqual({
        considered: 1,
        persisted: 0,
        approvalsCreated: 0,
        rejected: 1,
      });
      expect(
        await prisma.memory.findMany({ where: { userId: owner.id } }),
      ).toEqual([memory]);
      expect(
        await prisma.memoryRevision.count({ where: { memoryId: memory.id } }),
      ).toBe(1);
    },
  );

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

  it("persists elevated sensitivity only after owned, presented, explicit consent and preserves source expiry", async () => {
    const fixture = await sensitiveFixture();
    const { owner, chat, source, approval, now, expiresAt, text } = fixture;
    const premature = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Sì, salvalo in memoria.",
      createdAt: new Date(now.getTime() - 5_000),
    });
    expect(
      await resolveMemoryApproval({
        userId: owner.id,
        approvalId: approval.id,
        currentUserMessageId: premature.id,
        decision: "approve",
      }),
    ).toEqual({ status: "stale" });
    expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(0);

    const { confirmation, conversationId } =
      await presentSensitiveApproval(fixture);
    const stranger = await createUser();
    expect(
      await resolveMemoryApproval({
        userId: stranger.id,
        approvalId: approval.id,
        currentUserMessageId: confirmation.id,
        decision: "approve",
      }),
    ).toEqual({ status: "stale" });
    expect(await prisma.memory.count()).toBe(0);
    expect(
      await getImmediatelyAttributableApproval({
        userId: owner.id,
        conversationId,
        currentUserMessageId: confirmation.id,
      }),
    ).toMatchObject({ id: approval.id });
    const resolution = {
      userId: owner.id,
      approvalId: approval.id,
      currentUserMessageId: confirmation.id,
      decision: "approve" as const,
    };
    const result = await resolveMemoryApproval(resolution);
    expect(result.status).toBe("approved");
    if (!result.memoryId) throw new Error("Approved fact has no id");
    const fact = await prisma.memory.findUniqueOrThrow({
      where: { id: result.memoryId },
    });
    expect(fact).toMatchObject({
      userId: owner.id,
      sensitivity: "HIGH",
      origin: "CONFIRMED",
      sourceMessageId: source.id,
      sourceThreadId: conversationId,
      observedAt: source.createdAt,
      expiresAt,
      value: expect.objectContaining({
        content: text,
        _subject: "ACCOUNT_HOLDER",
      }),
    });
    expect(
      await prisma.memoryRevision.findFirstOrThrow({
        where: { memoryId: fact.id },
      }),
    ).toMatchObject({ sourceMessageId: confirmation.id, origin: "CONFIRMED" });
    expect(
      await prisma.memoryApproval.findUniqueOrThrow({
        where: { id: approval.id },
      }),
    ).toMatchObject({ status: "APPROVED" });
    expect(await resolveMemoryApproval(resolution)).toEqual({
      status: "stale",
    });
    expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(1);
    expect(
      await prisma.memoryRevision.count({ where: { memoryId: fact.id } }),
    ).toBe(1);
  });

  it.each([
    ["approval TTL", 60 * 60_000],
    ["temporary fact expiry", 5 * 60_000],
  ] as const)(
    "refuses explicit consent at the %s boundary",
    async (_reason, lifetimeMs) => {
      const fixture = await sensitiveFixture(lifetimeMs);
      const { owner, approval, expiresAt } = fixture;
      const { confirmation } = await presentSensitiveApproval(fixture);
      if (lifetimeMs < 15 * 60_000)
        expect(approval.expiresAt).toEqual(expiresAt);
      else
        expect(approval.expiresAt.getTime()).toBeLessThan(expiresAt.getTime());
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(approval.expiresAt);

      expect(
        await resolveMemoryApproval({
          userId: owner.id,
          approvalId: approval.id,
          currentUserMessageId: confirmation.id,
          decision: "approve",
        }),
      ).toEqual({ status: "stale" });
      expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(
        0,
      );
      expect(
        await prisma.memoryRevision.count({ where: { userId: owner.id } }),
      ).toBe(0);
      expect(
        await prisma.memoryApproval.findUniqueOrThrow({
          where: { id: approval.id },
        }),
      ).toMatchObject({ status: "EXPIRED" });
    },
  );

  it("does not attach consent to an approval after an intervening user turn", async () => {
    const fixture = await sensitiveFixture();
    const { owner, chat, approval, now } = fixture;
    const { confirmation, conversationId } =
      await presentSensitiveApproval(fixture);
    await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Cambiamo argomento: preparo la scaletta.",
      createdAt: new Date(now.getTime() - 2_000),
    });

    expect(
      await getImmediatelyAttributableApproval({
        userId: owner.id,
        conversationId,
        currentUserMessageId: confirmation.id,
      }),
    ).toBeNull();
    expect(
      await resolveMemoryApproval({
        userId: owner.id,
        approvalId: approval.id,
        currentUserMessageId: confirmation.id,
        decision: "approve",
      }),
    ).toEqual({ status: "stale" });
    expect(await prisma.memory.count({ where: { userId: owner.id } })).toBe(0);
    expect(
      await prisma.memoryApproval.findUniqueOrThrow({
        where: { id: approval.id },
      }),
    ).toMatchObject({ status: "PENDING" });
  });
});
