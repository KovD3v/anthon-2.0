import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  memoryApprovalCreate: vi.fn(),
  memoryApprovalFindFirst: vi.fn(),
  memoryApprovalUpdateMany: vi.fn(),
  memoryUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const transactionClient = {
    message: {
      findFirst: mocks.messageFindFirst,
      findMany: mocks.messageFindMany,
    },
    memoryApproval: {
      create: mocks.memoryApprovalCreate,
      findFirst: mocks.memoryApprovalFindFirst,
      updateMany: mocks.memoryApprovalUpdateMany,
    },
    memory: {
      upsert: mocks.memoryUpsert,
    },
  };

  return {
    prisma: {
      ...transactionClient,
      $transaction: mocks.transaction,
    },
  };
});

import {
  createMemoryApproval,
  getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval,
  resolveMemoryApproval,
} from "./memory-approval";

const now = new Date("2026-08-09T18:00:00.000Z");
const sourceMessage = {
  id: "inbound-source",
  userId: "user-1",
  conversationThreadId: "thread-1",
  direction: "INBOUND" as const,
  role: "USER" as const,
  deletedAt: null,
  createdAt: new Date("2026-08-09T17:58:00.000Z"),
  generatedResponse: {
    id: "assistant-source",
    userId: "user-1",
    conversationThreadId: "thread-1",
    direction: "OUTBOUND" as const,
    role: "ASSISTANT" as const,
    deletedAt: null,
  },
};
const currentMessage = {
  id: "inbound-current",
  userId: "user-1",
  conversationThreadId: "thread-1",
  createdAt: new Date("2026-08-09T18:00:00.000Z"),
  parts: [{ type: "text", text: "Sì, puoi salvarlo in memoria." }],
};
const pendingApproval = {
  id: "approval-1",
  userId: "user-1",
  sourceInboundMessageId: "inbound-source",
  key: "knee_injury",
  value: "Dolore persistente al ginocchio sinistro",
  category: "health",
  confidence: 0.94,
  status: "PENDING",
  createdAt: new Date("2026-08-09T17:58:30.000Z"),
  expiresAt: new Date("2026-08-09T18:13:30.000Z"),
  resolvedAt: null,
  sourceInboundMessage: sourceMessage,
};

describe("ai/memory-approval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.transaction.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.memoryApprovalCreate.mockReset();
    mocks.memoryApprovalFindFirst.mockReset();
    mocks.memoryApprovalUpdateMany.mockReset();
    mocks.memoryUpsert.mockReset();

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        message: {
          findFirst: mocks.messageFindFirst,
          findMany: mocks.messageFindMany,
        },
        memoryApproval: {
          create: mocks.memoryApprovalCreate,
          findFirst: mocks.memoryApprovalFindFirst,
          updateMany: mocks.memoryApprovalUpdateMany,
        },
        memory: { upsert: mocks.memoryUpsert },
      }),
    );
    mocks.memoryApprovalUpdateMany.mockResolvedValue({ count: 1 });
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });
  });

  it("loads approval context only for plausible approval or rejection text", () => {
    expect(
      mightResolvePendingMemoryApproval("Sì, puoi salvarlo in memoria."),
    ).toBe(true);
    expect(
      mightResolvePendingMemoryApproval("No, rifiuto il salvataggio."),
    ).toBe(true);
    expect(
      mightResolvePendingMemoryApproval("Aiutami per la partita di domani."),
    ).toBe(false);
    expect(mightResolvePendingMemoryApproval("Sì.")).toBe(true);
    expect(mightResolvePendingMemoryApproval("No.")).toBe(true);
    expect(mightResolvePendingMemoryApproval("Salvalo.")).toBe(true);
  });

  it("creates an expiring approval only for a user-owned inbound message", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce({ id: "inbound-source" });
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(null);
    mocks.memoryApprovalCreate.mockImplementation(async ({ data }) => ({
      id: "approval-1",
      ...data,
    }));

    const result = await createMemoryApproval({
      userId: "user-1",
      sourceInboundMessageId: "inbound-source",
      key: "knee_injury",
      value: "Dolore persistente al ginocchio sinistro",
      category: "health",
      confidence: 0.94,
    });

    expect(result).toEqual({
      id: "approval-1",
      userId: "user-1",
      sourceInboundMessageId: "inbound-source",
      key: "knee_injury",
      value: "Dolore persistente al ginocchio sinistro",
      category: "health",
      confidence: 0.94,
      expiresAt: new Date("2026-08-09T18:15:00.000Z"),
    });
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "inbound-source",
          userId: "user-1",
          direction: "INBOUND",
          role: "USER",
        }),
      }),
    );
    expect(mocks.memoryApprovalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        sourceInboundMessageId: "inbound-source",
        key: "knee_injury",
        expiresAt: new Date("2026-08-09T18:15:00.000Z"),
      }),
      select: expect.any(Object),
    });
  });

  it("rejects approval creation for another user's inbound message", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(null);

    await expect(
      createMemoryApproval({
        userId: "user-1",
        sourceInboundMessageId: "other-user-message",
        key: "knee_injury",
        value: "Dolore al ginocchio",
        category: "health",
        confidence: 0.9,
      }),
    ).rejects.toThrow("Inbound message is not attributable to the user");
    expect(mocks.memoryApprovalCreate).not.toHaveBeenCalled();
  });

  it("expires old rows and returns only an immediate same-conversation approval", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);

    const result = await getImmediatelyAttributableApproval({
      userId: "user-1",
      conversationId: "thread-1",
      currentUserMessageId: "inbound-current",
    });

    expect(mocks.memoryApprovalUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED", resolvedAt: now },
    });
    expect(result).toEqual({
      id: "approval-1",
      userId: "user-1",
      sourceInboundMessageId: "inbound-source",
      key: "knee_injury",
      value: "Dolore persistente al ginocchio sinistro",
      category: "health",
      confidence: 0.94,
      expiresAt: pendingApproval.expiresAt,
    });
  });

  it("does not attribute an approval after an unrelated subsequent user turn", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
    mocks.messageFindMany.mockResolvedValueOnce([
      { ...sourceMessage, id: "unrelated-inbound" },
    ]);

    const result = await getImmediatelyAttributableApproval({
      userId: "user-1",
      conversationId: "thread-1",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toBeNull();
  });

  it.each([
    ["another conversation", { conversationThreadId: "thread-2" }],
    ["a deleted response", { deletedAt: new Date() }],
    ["an inbound response", { direction: "INBOUND" as const }],
    ["a non-assistant response", { role: "USER" as const }],
  ])(
    "does not attribute approval to %s",
    async (_name, generatedResponsePatch) => {
      mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
      mocks.messageFindMany.mockResolvedValueOnce([
        {
          ...sourceMessage,
          generatedResponse: {
            ...sourceMessage.generatedResponse,
            ...generatedResponsePatch,
          },
        },
      ]);

      const result = await getImmediatelyAttributableApproval({
        userId: "user-1",
        conversationId: "thread-1",
        currentUserMessageId: "inbound-current",
      });

      expect(result).toBeNull();
      expect(mocks.memoryApprovalFindFirst).not.toHaveBeenCalled();
    },
  );

  it("fails closed when two preceding inbound turns share the latest timestamp", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
    mocks.messageFindMany.mockResolvedValueOnce([
      sourceMessage,
      { ...sourceMessage, id: "same-time-inbound" },
    ]);
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);

    const result = await getImmediatelyAttributableApproval({
      userId: "user-1",
      conversationId: "thread-1",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toBeNull();
    expect(mocks.memoryApprovalFindFirst).not.toHaveBeenCalled();
  });

  it("atomically approves exactly one stable key for the immediate explicit confirmation", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "approved", memoryId: "memory-1" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.memoryApprovalUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-1",
        userId: "user-1",
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { status: "APPROVED", resolvedAt: now },
    });
    expect(mocks.memoryUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.memoryUpsert).toHaveBeenCalledWith({
      where: {
        userId_key: { userId: "user-1", key: "knee_injury" },
      },
      update: expect.objectContaining({
        category: "health",
        value: expect.objectContaining({
          content: "Dolore persistente al ginocchio sinistro",
          confidence: 0.94,
        }),
      }),
      create: expect.objectContaining({
        userId: "user-1",
        key: "knee_injury",
        category: "health",
      }),
      select: { id: true },
    });
  });

  it("does not resolve an approval when the preceding inbound turn is ambiguous", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
    mocks.messageFindMany.mockResolvedValueOnce([
      sourceMessage,
      { ...sourceMessage, id: "same-time-inbound" },
    ]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "stale" });
    expect(mocks.memoryApprovalUpdateMany).not.toHaveBeenCalled();
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["another conversation", { conversationThreadId: "thread-2" }],
    ["a deleted response", { deletedAt: new Date() }],
    ["an inbound response", { direction: "INBOUND" as const }],
    ["a non-assistant response", { role: "USER" as const }],
  ])(
    "does not resolve an approval from %s",
    async (_name, generatedResponsePatch) => {
      mocks.memoryApprovalFindFirst.mockResolvedValueOnce({
        ...pendingApproval,
        sourceInboundMessage: {
          ...sourceMessage,
          generatedResponse: {
            ...sourceMessage.generatedResponse,
            ...generatedResponsePatch,
          },
        },
      });
      mocks.messageFindFirst.mockResolvedValueOnce(currentMessage);
      mocks.messageFindMany.mockResolvedValueOnce([
        {
          ...sourceMessage,
          generatedResponse: {
            ...sourceMessage.generatedResponse,
            ...generatedResponsePatch,
          },
        },
      ]);

      const result = await resolveMemoryApproval({
        userId: "user-1",
        approvalId: "approval-1",
        decision: "approve",
        currentUserMessageId: "inbound-current",
      });

      expect(result).toEqual({ status: "stale" });
      expect(mocks.memoryApprovalUpdateMany).not.toHaveBeenCalled();
      expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: "another user",
      approval: null,
      current: currentMessage,
      previous: sourceMessage,
    },
    {
      name: "an unrelated subsequent turn",
      approval: pendingApproval,
      current: currentMessage,
      previous: { ...sourceMessage, id: "unrelated-inbound" },
    },
    {
      name: "a repeated resolution",
      approval: null,
      current: currentMessage,
      previous: sourceMessage,
    },
  ])("treats $name as stale without writing memory", async (testCase) => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(testCase.approval);
    mocks.messageFindFirst.mockResolvedValueOnce(testCase.current);
    mocks.messageFindMany.mockResolvedValueOnce([testCase.previous]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "stale" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("expires a stale pending approval without writing memory", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce({
      ...pendingApproval,
      expiresAt: new Date("2026-08-09T17:59:59.000Z"),
    });

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "stale" });
    expect(mocks.memoryApprovalUpdateMany).toHaveBeenCalledWith({
      where: { id: "approval-1", userId: "user-1", status: "PENDING" },
      data: { status: "EXPIRED", resolvedAt: now },
    });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("rejects without creating or changing a memory", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce({
      ...currentMessage,
      parts: [{ type: "text", text: "No, non salvarlo in memoria." }],
    });
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "reject",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "rejected" });
    expect(mocks.memoryApprovalUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-1",
        userId: "user-1",
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { status: "REJECTED", resolvedAt: now },
    });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it.each(["Sì.", "Va bene.", "Sì, salvalo in memoria.", "Salvalo."])(
    "accepts the immediate natural confirmation %s",
    async (text) => {
      mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
      mocks.messageFindFirst.mockResolvedValueOnce({
        ...currentMessage,
        parts: [{ type: "text", text }],
      });
      mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

      const result = await resolveMemoryApproval({
        userId: "user-1",
        approvalId: "approval-1",
        decision: "approve",
        currentUserMessageId: "inbound-current",
      });

      expect(result).toEqual({ status: "approved", memoryId: "memory-1" });
      expect(mocks.memoryUpsert).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts a standalone natural rejection for the immediate approval", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce({
      ...currentMessage,
      parts: [{ type: "text", text: "No." }],
    });
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "reject",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "rejected" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("does not let an unrelated remember command approve a pending health fact", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce({
      ...currentMessage,
      parts: [
        {
          type: "text",
          text: "Ricorda che preferisco allenarmi al mattino.",
        },
      ],
    });
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "stale" });
    expect(mocks.memoryApprovalUpdateMany).not.toHaveBeenCalled();
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("does not approve a changed fact that overlaps the pending fact", async () => {
    mocks.memoryApprovalFindFirst.mockResolvedValueOnce(pendingApproval);
    mocks.messageFindFirst.mockResolvedValueOnce({
      ...currentMessage,
      parts: [
        {
          type: "text",
          text: "Salva il mio dolore al ginocchio destro.",
        },
      ],
    });
    mocks.messageFindMany.mockResolvedValueOnce([sourceMessage]);

    const result = await resolveMemoryApproval({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    expect(result).toEqual({ status: "stale" });
    expect(mocks.memoryApprovalUpdateMany).not.toHaveBeenCalled();
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });
});
