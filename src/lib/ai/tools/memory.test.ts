import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryUpsert: vi.fn(),
  memoryDeleteMany: vi.fn(),
  createMemoryApproval: vi.fn(),
  resolveMemoryApproval: vi.fn(),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
      upsert: mocks.memoryUpsert,
      deleteMany: mocks.memoryDeleteMany,
    },
  },
}));

vi.mock("@/lib/ai/memory-approval", () => ({
  createMemoryApproval: mocks.createMemoryApproval,
  resolveMemoryApproval: mocks.resolveMemoryApproval,
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
    mocks.memoryUpsert.mockReset();
    mocks.memoryDeleteMany.mockReset();
    mocks.createMemoryApproval.mockReset();
    mocks.resolveMemoryApproval.mockReset();
  });

  it("atomically saves or overwrites one low-risk stable key", async () => {
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });

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
    expect(mocks.memoryUpsert).toHaveBeenCalledWith({
      where: {
        userId_key: { userId: "user-1", key: "training_schedule" },
      },
      update: expect.objectContaining({
        category: "schedule",
        value: expect.objectContaining({
          content: "Tuesday and Thursday",
          confidence: 0.91,
        }),
      }),
      create: expect.objectContaining({
        userId: "user-1",
        key: "training_schedule",
        category: "schedule",
      }),
      select: { id: true },
    });
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
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
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
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
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
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("deletes only the exact stable key bound by the turn plan", async () => {
    mocks.memoryDeleteMany.mockResolvedValue({ count: 1 });
    const tools = createMemoryTools("user-1", {
      deleteTargetKey: "training_goal",
    });
    const deleteMemory = tools.deleteMemory as unknown as ToolDefinition<{
      status: string;
    }>;

    const result = await deleteMemory.execute({ key: "other_memory" });

    expect(result).toEqual({ status: "deleted" });
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", key: "training_goal" },
    });
  });

  it("returns not_found for an absent exact target", async () => {
    mocks.memoryDeleteMany.mockResolvedValue({ count: 0 });
    const tools = createMemoryTools("user-1", {
      deleteTargetKey: "training_goal",
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
      expect(mocks.memoryDeleteMany).not.toHaveBeenCalled();
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
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.memoryFindMany.mockRejectedValue(
      new Error("missing category column"),
    );

    const tools = createMemoryTools("user-1");
    const getMemories = tools.getMemories as unknown as ToolDefinition<{
      success: boolean;
      message: string;
    }>;
    const result = await getMemories.execute({ category: "all" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Errore nel recuperare");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[getMemories] Error:",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
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

    invalidateMemoriesForPromptCache(userId);
    await formatMemoriesForPrompt(userId);
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });
});
