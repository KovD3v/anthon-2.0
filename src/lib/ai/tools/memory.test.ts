import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  messageFindFirst: vi.fn(),
  memoryUpsert: vi.fn(),
  memoryDeleteMany: vi.fn(),
  recallFacts: vi.fn(),
  rememberFact: vi.fn(),
  reviseFact: vi.fn(),
  forgetFact: vi.fn(),
  findActiveFactIdByKey: vi.fn(),
  createMemoryApproval: vi.fn(),
  resolveMemoryApproval: vi.fn(),
  rankRetrievedItems: vi.fn(),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
      findFirst: mocks.memoryFindFirst,
      upsert: mocks.memoryUpsert,
      deleteMany: mocks.memoryDeleteMany,
    },
    message: { findFirst: mocks.messageFindFirst },
  },
}));

vi.mock("@/lib/ai/memory-approval", () => ({
  createMemoryApproval: mocks.createMemoryApproval,
  resolveMemoryApproval: mocks.resolveMemoryApproval,
}));

vi.mock("@/lib/ai/memory-facts", () => ({
  invalidateFactCache: vi.fn(),
  recallFacts: mocks.recallFacts,
  rememberFact: mocks.rememberFact,
  reviseFact: mocks.reviseFact,
  forgetFact: mocks.forgetFact,
  findActiveFactIdByKey: mocks.findActiveFactIdByKey,
}));
vi.mock("@/lib/ai/retrieval-decisions", () => ({
  rankRetrievedItems: mocks.rankRetrievedItems,
}));

import {
  createMemoryTools,
  formatMemoriesForPrompt,
  invalidateMemoriesForPromptCache,
} from "./memory";

type ToolDefinition<TResult> = {
  description: string;
  execute: (args: Record<string, unknown>) => Promise<TResult>;
};

describe("ai/tools/memory", () => {
  beforeEach(() => {
    mocks.tool.mockReset();
    mocks.tool.mockImplementation((definition) => definition);
    mocks.memoryFindMany.mockReset();
    mocks.memoryFindFirst.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.memoryUpsert.mockReset();
    mocks.memoryDeleteMany.mockReset();
    mocks.recallFacts.mockReset();
    mocks.rememberFact.mockReset();
    mocks.reviseFact.mockReset();
    mocks.forgetFact.mockReset();
    mocks.findActiveFactIdByKey.mockReset();
    mocks.createMemoryApproval.mockReset();
    mocks.resolveMemoryApproval.mockReset();
    mocks.rankRetrievedItems.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("resolves temporary live-tool writes from owned persisted message time and metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const observedAt = new Date("2026-09-18T10:00:00Z");
    mocks.messageFindFirst.mockResolvedValue({
      createdAt: observedAt,
      metadata: { timeZone: "Europe/Rome" },
      parts: [{ type: "text", text: "Consegna del progetto domani" }],
    });
    mocks.rememberFact.mockResolvedValue({
      status: "saved",
      factId: "memory-1",
    });
    const save = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
      sourceThreadId: "thread-1",
    }).rememberFact as unknown as ToolDefinition<{ status: string }>;
    expect(
      await save.execute({
        key: "work_deadline",
        value: "Consegna progetto",
        category: "schedule",
        confidence: 1,
        sensitivity: "low",
        expiry: { expression: "domani" },
      }),
    ).toEqual({ status: "saved", memoryId: "memory-1" });
    expect(mocks.rememberFact).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAt,
        expiresAt: new Date("2026-09-19T22:00:00Z"),
      }),
    );
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "inbound-1",
          userId: "user-1",
          role: "USER",
          direction: "INBOUND",
          deletedAt: null,
          conversationThreadId: "thread-1",
        },
      }),
    );
  });

  it("asks for date clarification instead of saving an ungrounded live-tool expiry", async () => {
    mocks.messageFindFirst.mockResolvedValue({
      createdAt: new Date(),
      metadata: {},
      parts: [{ type: "text", text: "Ho una scadenza" }],
    });
    mocks.memoryFindFirst.mockResolvedValue(null);
    const save = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    }).rememberFact as unknown as ToolDefinition<{ status: string }>;
    expect(
      (
        await save.execute({
          key: "work_deadline",
          value: "Consegna progetto",
          category: "schedule",
          confidence: 1,
          sensitivity: "low",
          expiry: { expression: "domani" },
        })
      ).status,
    ).toBe("clarification_required");
    expect(mocks.rememberFact).not.toHaveBeenCalled();
    expect(mocks.createMemoryApproval).not.toHaveBeenCalled();
  });

  it("atomically saves or overwrites one low-risk stable key", async () => {
    mocks.rememberFact.mockResolvedValue({
      status: "saved",
      factId: "memory-1",
    });

    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    const saveMemory = tools.saveMemory as unknown as ToolDefinition<{
      status: string;
      memoryId?: string;
    }>;
    const result = await saveMemory.execute({
      key: "training_schedule",
      value: "Tuesday and Thursday",
      category: "schedule",
      confidence: 0.91,
      sensitivity: "low",
    });

    expect(result).toEqual({ status: "saved", memoryId: "memory-1" });
    expect(mocks.rememberFact).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        key: "training_schedule",
        value: "Tuesday and Thursday",
        category: "schedule",
        confidence: 0.91,
        sensitivity: "LOW",
        origin: "INFERRED",
        sourceMessageId: "inbound-1",
        dedupeKey: "tool:inbound-1:training_schedule",
      }),
    );
  });

  it("rejects a low-confidence fact without creating memory or approval", async () => {
    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    const saveMemory = tools.saveMemory as unknown as ToolDefinition<{
      status: string;
    }>;

    const result = await saveMemory.execute({
      key: "possible_preference",
      value: "Maybe prefers morning training",
      category: "preference",
      confidence: 0.4,
      sensitivity: "low",
    });

    expect(result).toEqual({ status: "rejected" });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
    expect(mocks.createMemoryApproval).not.toHaveBeenCalled();
  });

  it("creates only a pending approval for a sensitive inference", async () => {
    mocks.createMemoryApproval.mockResolvedValue({
      id: "approval-1",
      userId: "user-1",
      sourceInboundMessageId: "inbound-1",
      key: "knee_injury",
      value: "Dolore al ginocchio sinistro",
      category: "health",
      confidence: 0.92,
      expiresAt: new Date("2026-08-09T18:15:00.000Z"),
    });

    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    const saveMemory = tools.saveMemory as unknown as ToolDefinition<{
      status: string;
      approvalId?: string;
    }>;
    const result = await saveMemory.execute({
      key: "knee_injury",
      value: "Dolore al ginocchio sinistro",
      category: "health",
      confidence: 0.92,
      sensitivity: "low",
    });

    expect(result).toEqual({
      status: "approval_required",
    });
    expect(mocks.createMemoryApproval).toHaveBeenCalledWith({
      userId: "user-1",
      sourceInboundMessageId: "inbound-1",
      key: "knee_injury",
      value: "Dolore al ginocchio sinistro",
      category: "health",
      confidence: 0.92,
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("lets the model request approval without supplying server ownership context", async () => {
    mocks.createMemoryApproval.mockResolvedValue({ id: "approval-2" });
    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    const requestApproval =
      tools.requestMemoryApproval as unknown as ToolDefinition<{
        status: string;
        approvalId: string;
      }>;

    const result = await requestApproval.execute({
      key: "trauma_history",
      value: "Esperienza traumatica pre-gara",
      category: "trauma",
      confidence: 0.88,
    });

    expect(result).toEqual({
      status: "approval_required",
    });
    expect(mocks.createMemoryApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceInboundMessageId: "inbound-1",
        key: "trauma_history",
      }),
    );
  });

  it("resolves only the server-bound immediate approval and invalidates after approval", async () => {
    mocks.memoryFindMany.mockResolvedValue([
      {
        key: "existing_fact",
        category: "other",
        value: {
          content: "Existing fact",
          category: "other",
          confidence: 0.9,
        },
      },
    ]);
    await formatMemoriesForPrompt("user-1");

    mocks.resolveMemoryApproval.mockResolvedValue({
      status: "approved",
      memoryId: "memory-approved",
    });
    const tools = createMemoryTools("user-1", {
      pendingMemoryApproval: {
        id: "approval-1",
        userId: "user-1",
        sourceInboundMessageId: "inbound-source",
        key: "training_goal",
        value: "Migliorare il servizio",
        category: "goal",
        confidence: 0.9,
        expiresAt: new Date("2026-08-09T18:15:00.000Z"),
      },
      currentUserMessageId: "inbound-current",
    });
    const resolveApproval =
      tools.resolveMemoryApproval as unknown as ToolDefinition<{
        status: string;
        memoryId?: string;
      }>;

    const result = await resolveApproval.execute({ decision: "approve" });

    expect(result).toEqual({
      status: "approved",
    });
    expect(mocks.resolveMemoryApproval).toHaveBeenCalledWith({
      userId: "user-1",
      approvalId: "approval-1",
      decision: "approve",
      currentUserMessageId: "inbound-current",
    });

    await formatMemoriesForPrompt("user-1");
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });

  it("does not accept a model-supplied approval id", async () => {
    mocks.resolveMemoryApproval.mockResolvedValue({
      status: "approved",
      memoryId: "memory-approved",
    });
    const tools = createMemoryTools("user-1", {
      pendingMemoryApproval: {
        id: "approval-1",
        userId: "user-1",
        sourceInboundMessageId: "inbound-source",
        key: "training_goal",
        value: "Migliorare il servizio",
        category: "goal",
        confidence: 0.9,
        expiresAt: new Date("2026-08-09T18:15:00.000Z"),
      },
      currentUserMessageId: "inbound-current",
    });
    const resolveApproval =
      tools.resolveMemoryApproval as unknown as ToolDefinition<{
        status: string;
      }>;

    const result = await resolveApproval.execute({
      approvalId: "approval-from-client",
      decision: "approve",
    });

    expect(result).toEqual({ status: "approved" });
    expect(mocks.resolveMemoryApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "approval-1" }),
    );
  });

  it("server-enforces high-impact policy when model labels a fact low-risk", async () => {
    mocks.createMemoryApproval.mockResolvedValue({
      id: "approval-medical",
      userId: "user-1",
      sourceInboundMessageId: "inbound-1",
      key: "medical_condition",
      value: "Diagnosi di asma",
      category: "other",
      confidence: 0.94,
      expiresAt: new Date("2026-08-09T18:15:00.000Z"),
    });

    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
    });
    const saveMemory = tools.saveMemory as unknown as ToolDefinition<{
      status: string;
    }>;

    const result = await saveMemory.execute({
      key: "medical_condition",
      value: "Diagnosi di asma",
      category: "other",
      confidence: 0.94,
      sensitivity: "low",
    });

    expect(result).toEqual({ status: "approval_required" });
    expect(mocks.createMemoryApproval).toHaveBeenCalled();
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("deletes only the exact stable key bound by the turn plan", async () => {
    mocks.findActiveFactIdByKey.mockResolvedValue("memory-1");
    mocks.forgetFact.mockResolvedValue({
      status: "forgotten",
      factId: "memory-1",
    });
    const tools = createMemoryTools("user-1", {
      deleteTargetKey: "training_goal",
      sourceInboundMessageId: "inbound-delete",
    });
    const deleteMemory = tools.deleteMemory as unknown as ToolDefinition<{
      status: string;
    }>;

    const result = await deleteMemory.execute({ key: "other_memory" });

    expect(result).toEqual({ status: "deleted" });
    expect(mocks.findActiveFactIdByKey).toHaveBeenCalledWith(
      "user-1",
      "training_goal",
    );
    expect(mocks.forgetFact).toHaveBeenCalledWith({
      userId: "user-1",
      factId: "memory-1",
      sourceMessageId: "inbound-delete",
      dedupeKey: "tool:inbound-delete:forget:memory-1",
    });
  });

  it("returns not_found for an absent exact target", async () => {
    mocks.findActiveFactIdByKey.mockResolvedValue(null);
    const tools = createMemoryTools("user-1", {
      deleteTargetKey: "training_goal",
      sourceInboundMessageId: "inbound-delete",
    });
    const deleteMemory = tools.deleteMemory as unknown as ToolDefinition<{
      status: string;
    }>;

    const result = await deleteMemory.execute({});

    expect(result).toEqual({ status: "not_found" });
  });

  it.each([null, "*", "health", "identity", "preference", "training-*"])(
    "does nothing for an ambiguous or broad delete target %s",
    async (deleteTargetKey) => {
      const tools = createMemoryTools("user-1", { deleteTargetKey });
      const deleteMemory = tools.deleteMemory as unknown as ToolDefinition<{
        status: string;
      }>;

      const result = await deleteMemory.execute({ key: "training_goal" });

      expect(result).toEqual({ status: "ambiguous" });
      expect(mocks.findActiveFactIdByKey).not.toHaveBeenCalled();
      expect(mocks.forgetFact).not.toHaveBeenCalled();
    },
  );

  it("describes silent side effects and explicit sensitive confirmation", () => {
    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
      pendingMemoryApproval: {
        id: "approval-1",
        userId: "user-1",
        sourceInboundMessageId: "inbound-source",
        key: "training_goal",
        value: "Migliorare il servizio",
        category: "goal",
        confidence: 0.9,
        expiresAt: new Date("2026-08-09T18:15:00.000Z"),
      },
      currentUserMessageId: "inbound-current",
    });

    const saveDescription = (
      tools.saveMemory as unknown as ToolDefinition<never>
    ).description;
    const resolveDescription = (
      tools.resolveMemoryApproval as unknown as ToolDefinition<never>
    ).description;

    expect(saveDescription).toContain("silenzioso");
    expect(saveDescription).toContain("inferire con prudenza");
    expect(saveDescription).toContain("conferma naturale");
    expect(resolveDescription).toContain("sì generico");
    expect(resolveDescription).toContain("turno immediatamente successivo");
  });

  it("getMemories returns a non-fatal error when memory storage is unavailable", async () => {
    mocks.recallFacts.mockResolvedValue({ facts: [], degraded: true });

    const tools = createMemoryTools("user-1");
    const getMemories = tools.getMemories as unknown as ToolDefinition<{
      success: boolean;
      message: string;
    }>;
    const result = await getMemories.execute({ category: "all" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Errore nel recuperare");
    expect(mocks.memoryFindMany).not.toHaveBeenCalled();
  });

  it("ranks only authorized live fact reads and preserves expiry filtering", async () => {
    const facts = [
      { key: "event", content: "Expired", expiresAt: new Date(0) },
      {
        key: "my_work",
        content: "Useful",
        expiresAt: null,
        subject: "ACCOUNT_HOLDER",
      },
      { key: "sister_sport", content: "Unrelated", expiresAt: null },
    ];
    mocks.recallFacts.mockResolvedValue({ facts, degraded: false });
    mocks.rankRetrievedItems.mockResolvedValue([facts[1]]);
    const recall = createMemoryTools("user-1", {
      retrievalOptions: { userId: "other-user", recentMessages: [] },
    }).recallFacts as unknown as ToolDefinition<{ data: { value: string }[] }>;
    const result = await recall.execute({ query: "my presentation" });
    expect(mocks.rankRetrievedItems).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        source: "memory",
        query: "my presentation",
        items: facts.slice(1),
      }),
    );
    expect(result.data.map((fact) => fact.value)).toEqual(["Useful"]);
    const subject = mocks.rankRetrievedItems.mock.calls[0][0].memorySubject;
    expect(subject(facts[1])).toBe("ACCOUNT_HOLDER");
    expect(subject(facts[2])).toBeUndefined();
    expect(subject({ ...facts[2], subject: "REFERENCED_PERSON" })).toBe(
      "REFERENCED_PERSON",
    );

    mocks.rankRetrievedItems.mockClear();
    const legacy = createMemoryTools("user-1")
      .recallFacts as unknown as ToolDefinition<{ data: { value: string }[] }>;
    expect(
      (await legacy.execute({ query: "my presentation" })).data,
    ).toHaveLength(2);
    expect(mocks.rankRetrievedItems).not.toHaveBeenCalled();
  });

  it("exposes modern fact tools with legacy aliases during rollout", () => {
    const tools = createMemoryTools("user-1", {
      sourceInboundMessageId: "inbound-1",
      deleteTargetKey: "training_goal",
    });

    expect(tools.recallFacts).toBe(tools.getMemories);
    expect(tools.rememberFact).toBe(tools.saveMemory);
    expect(tools.forgetFact).toBe(tools.deleteMemory);
    expect(tools).toHaveProperty("reviseFact");
  });

  it("formatMemoriesForPrompt caches output and supports invalidation", async () => {
    const userId = "user-cache";
    mocks.memoryFindMany.mockResolvedValue([
      {
        key: "favorite_exercise",
        category: "sport",
        value: {
          content: "Back squat",
          category: "sport",
          confidence: 0.9,
        },
      },
    ]);

    const first = await formatMemoriesForPrompt(userId);
    const second = await formatMemoriesForPrompt(userId);

    expect(first).toContain("Back squat");
    expect(second).toContain("Back squat");
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: "desc" },
        take: 16,
        select: {
          key: true,
          value: true,
          category: true,
          expiresAt: true,
          observedAt: true,
        },
      }),
    );

    invalidateMemoriesForPromptCache(userId);
    await formatMemoriesForPrompt(userId);
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });

  it("expires formatted prompt memory exactly on its deadline, before the cache TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const row = {
      key: "work_deadline",
      category: "schedule",
      value: { content: "Delivery" },
      expiresAt: new Date("2026-09-19T12:00:05Z"),
    };
    mocks.memoryFindMany.mockResolvedValueOnce([row]).mockResolvedValue([]);
    expect(await formatMemoriesForPrompt("expiring-prompt")).toContain(
      "Delivery",
    );
    vi.advanceTimersByTime(5_000);
    expect(await formatMemoriesForPrompt("expiring-prompt")).toBe("");
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent prompt memory loads", async () => {
    const userId = "user-in-flight";
    const row = {
      key: "training_goal",
      category: "goal",
      value: { content: "Migliorare il servizio" },
    };
    let resolveLoad: ((value: (typeof row)[]) => void) | undefined;
    mocks.memoryFindMany.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = formatMemoriesForPrompt(userId);
    const second = formatMemoriesForPrompt(userId);

    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(1);
    resolveLoad?.([row]);

    const [firstValue, secondValue] = await Promise.all([first, second]);
    expect(firstValue).toContain("Migliorare il servizio");
    expect(secondValue).toBe(firstValue);
  });

  it("records memory query and formatting as separate profiler spans", async () => {
    const userId = "user-traced";
    mocks.memoryFindMany.mockResolvedValue([
      {
        key: "sport",
        category: "sport",
        value: { content: "Tennis" },
      },
    ]);
    const traceCollector = {
      measure: vi.fn(
        async (_name: string, operation: () => unknown | Promise<unknown>) =>
          await operation(),
      ),
    };

    await formatMemoriesForPrompt(userId, {
      traceCollector: traceCollector as never,
    });

    expect(traceCollector.measure).toHaveBeenNthCalledWith(
      1,
      "memory_query",
      expect.any(Function),
    );
    expect(traceCollector.measure).toHaveBeenNthCalledWith(
      2,
      "memory_format",
      expect.any(Function),
    );
  });
});
