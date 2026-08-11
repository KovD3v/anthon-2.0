import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    modelExperiment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    modelExperimentVariant: { update: vi.fn() },
    modelExperimentAudit: { create: vi.fn() },
    modelExperimentParticipant: {
      createMany: vi.fn(),
      update: vi.fn(),
    },
    modelExperimentPair: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aiUsageReservation: { findUnique: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn() },
    messageMetrics: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(),
    captureEvent: vi.fn(),
    extractMemories: vi.fn(),
    refreshSummary: vi.fn(),
    loggerWarn: vi.fn(),
    reconcileUsage: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/ai/memory-extractor", () => ({
  extractAndSaveMemories: mocks.extractMemories,
}));

vi.mock("@/lib/ai/thread-context", () => ({
  safelyRefreshConversationThreadSummary: mocks.refreshSummary,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: mocks.loggerWarn }),
}));

vi.mock("@/lib/rate-limit", () => ({
  reconcileAiUsageInTransaction: mocks.reconcileUsage,
}));

vi.mock("./analytics", () => ({
  captureModelComparisonEvent: mocks.captureEvent,
  MODEL_COMPARISON_EVENTS: {
    exposed: "exposed",
    expired: "expired",
    partialFailure: "partial_failure",
    voted: "voted",
  },
}));

import {
  createModelComparisonPair,
  createModelExperiment,
  deleteDraftModelExperiment,
  finalizeFailedModelComparisonPair,
  finalizeReadyModelComparisonPair,
  markModelComparisonExposed,
  resolveModelComparisonPair,
  transitionModelExperiment,
  updateDraftModelExperiment,
} from "./service";

const control = {
  id: "control",
  role: "CONTROL",
  modelId: "provider/control",
  provider: "openrouter",
  generationConfig: { fallbacks: false },
};
const candidate = {
  id: "candidate",
  role: "CANDIDATE",
  modelId: "provider/candidate",
  provider: "openrouter",
  generationConfig: { fallbacks: false },
};

function experiment(status = "DRAFT") {
  return {
    id: "experiment-1",
    key: "experiment-key",
    name: "Experiment",
    status,
    posthogFlagKey: "experiment-flag",
    targetCountry: "IT",
    cooldownHours: 24,
    perUserCap: 5,
    activatedAt: null,
    variants: [control, candidate],
  };
}

const createInput = {
  key: "experiment-key",
  name: "Experiment",
  posthogFlagKey: "experiment-flag",
  targetCountry: "IT",
  cooldownHours: 24,
  perUserCap: 5,
  control: {
    modelId: control.modelId,
    generationConfig: { fallbacks: false as const },
  },
  candidate: {
    modelId: candidate.modelId,
    generationConfig: { fallbacks: false as const },
  },
};

function unresolvedPair(
  overrides: Partial<{
    userId: string;
    status: string;
    vote: string | null;
    capabilityPlannerMode: "legacy" | "agentic";
    canonicalMessage: { id: string } | null;
    responses: Array<Record<string, unknown>>;
  }> = {},
) {
  const responseFor = (variant: typeof control, text: string) => ({
    id: `response-${variant.id}`,
    variantId: variant.id,
    status: "COMPLETED",
    text,
    parts: [{ type: "text", text }],
    modelId: variant.modelId,
    provider: variant.provider,
    inputTokens: 10,
    outputTokens: 5,
    reasoningTokens: null,
    costUsd: 0.001,
    generationTimeMs: 100,
  });
  return {
    id: "pair-1",
    experimentId: "experiment-1",
    participantId: "participant-1",
    userId: overrides.userId ?? "user-1",
    chatId: "chat-1",
    conversationThreadId: "thread-1",
    countryCode: "IT",
    capabilityPlannerMode: overrides.capabilityPlannerMode ?? "legacy",
    status: overrides.status ?? "READY",
    vote: overrides.vote ?? null,
    canonicalMessage: overrides.canonicalMessage ?? null,
    slotAVariantId: control.id,
    slotBVariantId: candidate.id,
    slotAVariant: control,
    slotBVariant: candidate,
    responses: overrides.responses ?? [
      responseFor(control, "Control response"),
      responseFor(candidate, "Candidate response"),
    ],
    sourceMessage: {
      parts: [{ type: "text", text: "Source question" }],
    },
  };
}

describe("model experiment service", () => {
  beforeEach(() => {
    mocks.transaction.mockImplementation(async (callback) =>
      callback(mocks.tx),
    );
    mocks.tx.$queryRaw.mockResolvedValue([{ id: "experiment-1" }]);
    mocks.tx.modelExperimentAudit.create.mockResolvedValue({});
    mocks.tx.modelExperimentVariant.update.mockResolvedValue({});
    mocks.tx.modelExperimentParticipant.update.mockResolvedValue({});
    mocks.tx.aiUsageReservation.findUnique.mockResolvedValue({
      id: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.tx.aiUsageReservation.updateMany.mockResolvedValue({ count: 1 });
    mocks.reconcileUsage.mockResolvedValue({ charged: true });
  });

  it("creates both immutable roles and records the initial audit snapshot", async () => {
    const created = experiment();
    mocks.tx.modelExperiment.create.mockResolvedValue(created);

    await expect(
      createModelExperiment("admin-1", createInput),
    ).resolves.toEqual(created);
    expect(mocks.tx.modelExperiment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: "experiment-key",
        createdByAdminId: "admin-1",
        variants: {
          create: [
            expect.objectContaining({ role: "CONTROL" }),
            expect.objectContaining({ role: "CANDIDATE" }),
          ],
        },
      }),
      include: { variants: true },
    });
    expect(mocks.tx.modelExperimentAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        experimentId: "experiment-1",
        actorUserId: "admin-1",
        action: "CREATED",
      }),
    });
  });

  it("locks and updates draft metadata and only the supplied variant", async () => {
    const before = experiment();
    const afterMetadata = { ...before, name: "Updated" };
    const final = {
      ...afterMetadata,
      variants: [{ ...control, modelId: "provider/new-control" }, candidate],
    };
    mocks.tx.modelExperiment.findUnique
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(final);
    mocks.tx.modelExperiment.update.mockResolvedValue(afterMetadata);

    await expect(
      updateDraftModelExperiment("experiment-1", "admin-1", {
        name: "Updated",
        control: {
          modelId: "provider/new-control",
          generationConfig: { fallbacks: false },
        },
      }),
    ).resolves.toEqual(final);

    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.modelExperiment.findUnique.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.modelExperimentVariant.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.modelExperimentVariant.update).toHaveBeenCalledWith({
      where: {
        experimentId_role: {
          experimentId: "experiment-1",
          role: "CONTROL",
        },
      },
      data: {
        modelId: "provider/new-control",
        generationConfig: { fallbacks: false },
      },
    });
  });

  it("rejects a draft edit after the row lock reveals a non-draft state", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue(experiment("ACTIVE"));

    await expect(
      updateDraftModelExperiment("experiment-1", "admin-1", {
        name: "Too late",
      }),
    ).rejects.toThrow("CONFIGURATION_IMMUTABLE");
    expect(mocks.tx.modelExperiment.update).not.toHaveBeenCalled();
  });

  it("reports a missing experiment from the row-lock query", async () => {
    mocks.tx.$queryRaw.mockResolvedValue([]);

    await expect(
      updateDraftModelExperiment("missing", "admin-1", { name: "Missing" }),
    ).rejects.toThrow("EXPERIMENT_NOT_FOUND");
    expect(mocks.tx.modelExperiment.findUnique).not.toHaveBeenCalled();
  });

  it("locks and deletes only an unused draft", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      status: "DRAFT",
      _count: { participants: 0, pairs: 0 },
    });
    mocks.tx.modelExperiment.delete.mockResolvedValue({ id: "experiment-1" });

    await expect(deleteDraftModelExperiment("experiment-1")).resolves.toEqual({
      id: "experiment-1",
    });
    expect(mocks.tx.modelExperiment.delete).toHaveBeenCalledWith({
      where: { id: "experiment-1" },
    });
  });

  it("rejects deletion after participation starts", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      status: "DRAFT",
      _count: { participants: 1, pairs: 0 },
    });

    await expect(deleteDraftModelExperiment("experiment-1")).rejects.toThrow(
      "EXPERIMENT_DELETE_NOT_ALLOWED",
    );
    expect(mocks.tx.modelExperiment.delete).not.toHaveBeenCalled();
  });

  it("performs readiness checks and persists the lifecycle audit under the lock", async () => {
    const before = experiment("DRAFT");
    const ready = { ...before, status: "READY" };
    mocks.tx.modelExperiment.findUnique.mockResolvedValue(before);
    mocks.tx.modelExperiment.update.mockResolvedValue(ready);

    await expect(
      transitionModelExperiment("experiment-1", "admin-1", "READY"),
    ).resolves.toEqual(ready);
    expect(mocks.tx.modelExperiment.update).toHaveBeenCalledWith({
      where: { id: "experiment-1" },
      data: { status: "READY", readyAt: expect.any(Date) },
      include: { variants: true },
    });
    expect(mocks.tx.modelExperimentAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "READY" }),
    });
  });

  it("fails readiness when a variant can use provider fallbacks", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      ...experiment("DRAFT"),
      variants: [
        control,
        { ...candidate, generationConfig: { fallbacks: true } },
      ],
    });

    await expect(
      transitionModelExperiment("experiment-1", "admin-1", "READY"),
    ).rejects.toThrow("READINESS_CHECK_FAILED");
    expect(mocks.tx.modelExperiment.update).not.toHaveBeenCalled();
  });

  it("preserves the first activation timestamp when resuming", async () => {
    const activatedAt = new Date("2026-07-01T10:00:00Z");
    const before = {
      ...experiment("PAUSED"),
      activatedAt,
    };
    const active = { ...before, status: "ACTIVE", pausedAt: null };
    mocks.tx.modelExperiment.findUnique.mockResolvedValue(before);
    mocks.tx.modelExperiment.update.mockResolvedValue(active);

    await transitionModelExperiment("experiment-1", "admin-1", "RESUME");

    expect(mocks.tx.modelExperiment.update).toHaveBeenCalledWith({
      where: { id: "experiment-1" },
      data: {
        status: "ACTIVE",
        activatedAt,
        pausedAt: null,
      },
      include: { variants: true },
    });
  });

  it("creates one randomized pair and advances rolling cadence", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      ...experiment("ACTIVE"),
      cooldownHours: 2,
      perUserCap: 3,
    });
    mocks.tx.modelExperimentParticipant.createMany.mockResolvedValue({
      count: 1,
    });
    mocks.tx.$queryRaw.mockResolvedValue([
      {
        id: "participant-1",
        attempts: 0,
        nextEligibleAt: null,
        noticeState: "NOT_SHOWN",
      },
    ]);
    mocks.tx.modelExperimentPair.create.mockResolvedValue({ id: "pair-1" });
    const now = new Date("2026-07-31T10:00:00Z");

    await expect(
      createModelComparisonPair({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "it",
        capabilityPlannerMode: "agentic",
        now,
        random: () => 0.9,
      }),
    ).resolves.toEqual({
      pair: { id: "pair-1" },
      noticeRequired: true,
    });

    expect(mocks.tx.modelExperimentPair.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slotAVariantId: "candidate",
        slotBVariantId: "control",
        countryCode: "IT",
        capabilityPlannerMode: "agentic",
        expiresAt: new Date("2026-08-01T10:00:00Z"),
      }),
      include: { responses: true, slotAVariant: true, slotBVariant: true },
    });
    expect(mocks.tx.modelExperimentParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: {
        attempts: { increment: 1 },
        nextEligibleAt: new Date("2026-07-31T12:00:00Z"),
      },
    });
  });

  it.each([
    {
      attempts: 3,
      nextEligibleAt: null,
      label: "attempt cap",
    },
    {
      attempts: 1,
      nextEligibleAt: new Date("2026-07-31T11:00:00Z"),
      label: "cooldown",
    },
  ])("rejects a participant blocked by $label", async (participant) => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      ...experiment("ACTIVE"),
      perUserCap: 3,
    });
    mocks.tx.modelExperimentParticipant.createMany.mockResolvedValue({
      count: 0,
    });
    mocks.tx.$queryRaw.mockResolvedValue([
      {
        id: "participant-1",
        noticeState: "NOT_SHOWN",
        ...participant,
      },
    ]);

    await expect(
      createModelComparisonPair({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "IT",
        now: new Date("2026-07-31T10:00:00Z"),
      }),
    ).rejects.toThrow("PARTICIPANT_NOT_ELIGIBLE");
    expect(mocks.tx.modelExperimentPair.create).not.toHaveBeenCalled();
  });

  it("rejects pair creation for an inactive experiment", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue(experiment("READY"));

    await expect(
      createModelComparisonPair({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "IT",
      }),
    ).rejects.toThrow("EXPERIMENT_NOT_ACTIVE");
    expect(
      mocks.tx.modelExperimentParticipant.createMany,
    ).not.toHaveBeenCalled();
  });

  it("rejects pair creation when either fixed experiment role is absent", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue({
      ...experiment("ACTIVE"),
      variants: [control],
    });

    await expect(
      createModelComparisonPair({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "IT",
      }),
    ).rejects.toThrow("EXPERIMENT_VARIANTS_INVALID");
  });

  it("does not request the notice again for an existing participant", async () => {
    mocks.tx.modelExperiment.findUnique.mockResolvedValue(experiment("ACTIVE"));
    mocks.tx.modelExperimentParticipant.createMany.mockResolvedValue({
      count: 0,
    });
    mocks.tx.$queryRaw.mockResolvedValue([
      {
        id: "participant-1",
        attempts: 1,
        nextEligibleAt: null,
        noticeState: "SHOWN",
      },
    ]);
    mocks.tx.modelExperimentPair.create.mockResolvedValue({ id: "pair-1" });

    await expect(
      createModelComparisonPair({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "IT",
      }),
    ).resolves.toMatchObject({ noticeRequired: false });
  });

  it("marks the first exposure and emits the randomized slot mapping", async () => {
    const pair = {
      ...unresolvedPair(),
      exposedAt: null,
      participant: { id: "participant-1" },
      experiment: experiment("ACTIVE"),
    };
    const exposed = { ...pair, exposedAt: new Date() };
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);
    mocks.tx.modelExperimentPair.update.mockResolvedValue(exposed);

    await markModelComparisonExposed("pair-1", "clerk-1", {
      prompt_mode: "full",
    });

    expect(mocks.tx.modelExperimentParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: { noticeState: "SHOWN", lastExposedAt: expect.any(Date) },
    });
    expect(mocks.tx.modelExperimentPair.update).toHaveBeenCalledWith({
      where: { id: "pair-1" },
      data: { exposedAt: expect.any(Date) },
      include: {
        experiment: true,
        slotAVariant: true,
        slotBVariant: true,
      },
    });
    expect(mocks.captureEvent).toHaveBeenCalledWith("exposed", "clerk-1", {
      experiment_id: "experiment-1",
      pair_id: "pair-1",
      slot_a_role: "CONTROL",
      slot_b_role: "CANDIDATE",
      slot_a_model: "provider/control",
      slot_b_model: "provider/candidate",
      country: "IT",
      prompt_mode: "full",
    });
  });

  it("does nothing when an exposure pair no longer exists", async () => {
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(null);

    await markModelComparisonExposed("missing", "clerk-1");

    expect(mocks.tx.modelExperimentParticipant.update).not.toHaveBeenCalled();
    expect(mocks.tx.modelExperimentPair.update).not.toHaveBeenCalled();
    expect(mocks.captureEvent).not.toHaveBeenCalled();
  });

  it("does not rewrite an exposure timestamp that is already present", async () => {
    const pair = {
      ...unresolvedPair(),
      exposedAt: new Date("2026-07-31T10:00:00Z"),
      participant: { id: "participant-1" },
      experiment: experiment("ACTIVE"),
    };
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);

    await markModelComparisonExposed("pair-1", "clerk-1");

    expect(mocks.tx.modelExperimentParticipant.update).not.toHaveBeenCalled();
    expect(mocks.tx.modelExperimentPair.update).not.toHaveBeenCalled();
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "exposed",
      "clerk-1",
      expect.objectContaining({ pair_id: "pair-1" }),
    );
  });

  it("atomically reconciles summed usage while marking a pair ready", async () => {
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      sourceMessageId: "message-1",
      status: "GENERATING",
    });
    mocks.tx.modelExperimentPair.update.mockResolvedValue({
      id: "pair-1",
      status: "READY",
    });
    const usageMetrics = {
      model: "control + candidate",
      inputTokens: 20,
      outputTokens: 10,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0.002,
      generationTimeMs: 200,
      reasoningTimeMs: null,
    };

    await finalizeReadyModelComparisonPair({
      pairId: "pair-1",
      userId: "user-1",
      metrics: usageMetrics,
    });

    expect(mocks.reconcileUsage).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileUsage).toHaveBeenCalledWith(mocks.tx, {
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
      metrics: usageMetrics,
    });
    expect(mocks.tx.modelExperimentPair.update).toHaveBeenCalledWith({
      where: { id: "pair-1" },
      data: { status: "READY", readyAt: expect.any(Date) },
    });
    expect(mocks.reconcileUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.modelExperimentPair.update.mock.invocationCallOrder[0],
    );
  });

  it("atomically releases usage while marking a zero-success pair failed", async () => {
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      sourceMessageId: "message-1",
      status: "GENERATING",
    });
    mocks.tx.modelExperimentPair.update.mockResolvedValue({
      id: "pair-1",
      status: "FAILED",
    });

    await finalizeFailedModelComparisonPair({
      pairId: "pair-1",
      userId: "user-1",
    });

    expect(mocks.tx.aiUsageReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "reservation-1",
        userId: "user-1",
        claimToken: "claim-1",
        status: "RESERVED",
      },
      data: { status: "RELEASED", releasedAt: expect.any(Date) },
    });
    expect(mocks.tx.modelExperimentPair.update).toHaveBeenCalledWith({
      where: { id: "pair-1" },
      data: { status: "FAILED", resolvedAt: expect.any(Date) },
    });
  });

  it("reconciles partial usage in the canonical-message transaction", async () => {
    const pair = unresolvedPair({
      status: "GENERATING",
      responses: [unresolvedPair().responses[1]],
    });
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);
    mocks.tx.message.create.mockResolvedValue({ id: "assistant-1" });
    mocks.tx.messageMetrics.create.mockResolvedValue({});
    mocks.tx.modelExperimentPair.update.mockResolvedValue({
      ...pair,
      status: "PARTIAL_FAILED",
      experiment: experiment("ACTIVE"),
    });
    mocks.refreshSummary.mockResolvedValue(undefined);
    mocks.extractMemories.mockResolvedValue(undefined);
    const usageMetrics = {
      model: "provider/candidate",
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0.001,
      generationTimeMs: 100,
      reasoningTimeMs: null,
    };

    await resolveModelComparisonPair({
      pairId: "pair-1",
      userId: "user-1",
      clerkId: "clerk-1",
      choice: "AUTO_SUCCESS",
      usageMetrics,
    });

    expect(mocks.reconcileUsage).toHaveBeenCalledWith(mocks.tx, {
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
      metrics: usageMetrics,
      assistantMessageId: "assistant-1",
    });
  });

  it("resolves a ready vote without consolidating comparison output", async () => {
    const pair = unresolvedPair();
    const message = { id: "assistant-1" };
    const updatedPair = {
      ...pair,
      status: "RESOLVED",
      vote: "A",
      experiment: experiment("ACTIVE"),
    };
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);
    mocks.tx.message.create.mockResolvedValue(message);
    mocks.tx.messageMetrics.create.mockResolvedValue({});
    mocks.tx.modelExperimentPair.update.mockResolvedValue(updatedPair);
    mocks.refreshSummary.mockResolvedValue(undefined);
    mocks.extractMemories.mockResolvedValue(undefined);

    const result = await resolveModelComparisonPair({
      pairId: "pair-1",
      userId: "user-1",
      clerkId: "clerk-1",
      choice: "A",
    });

    expect(result).toMatchObject({ created: true, message });
    expect(mocks.tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        model: "provider/control",
        metadata: { modelComparisonPairId: "pair-1" },
      }),
    });
    expect(mocks.tx.modelExperimentPair.update).toHaveBeenCalledWith({
      where: { id: "pair-1" },
      data: expect.objectContaining({
        status: "RESOLVED",
        vote: "A",
        selectedVariantId: "control",
        canonicalMessageId: "assistant-1",
      }),
      include: { experiment: true },
    });
    expect(mocks.tx.modelExperimentParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: { completedComparisons: { increment: 1 } },
    });
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "voted",
      "clerk-1",
      expect.objectContaining({ choice: "A" }),
    );
    expect(mocks.refreshSummary).toHaveBeenCalledWith("thread-1", "user-1");
    expect(mocks.extractMemories).not.toHaveBeenCalled();
  });

  it("does not extract memories again for an agentic comparison", async () => {
    const pair = unresolvedPair({ capabilityPlannerMode: "agentic" });
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);
    mocks.tx.message.create.mockResolvedValue({ id: "assistant-1" });
    mocks.tx.messageMetrics.create.mockResolvedValue({});
    mocks.tx.modelExperimentPair.update.mockResolvedValue({
      ...pair,
      status: "RESOLVED",
      experiment: experiment("ACTIVE"),
    });
    mocks.refreshSummary.mockResolvedValue(undefined);

    await resolveModelComparisonPair({
      pairId: "pair-1",
      userId: "user-1",
      clerkId: "clerk-1",
      choice: "A",
    });

    expect(mocks.refreshSummary).toHaveBeenCalledWith("thread-1", "user-1");
    expect(mocks.extractMemories).not.toHaveBeenCalled();
  });

  it.each([
    {
      choice: "AUTO_SUCCESS" as const,
      expectedStatus: "PARTIAL_FAILED",
      expectedEvent: "partial_failure",
      responses: [
        {
          ...unresolvedPair().responses[1],
          variantId: candidate.id,
        },
      ],
    },
    {
      choice: "AUTO_CONTROL" as const,
      expectedStatus: "EXPIRED",
      expectedEvent: "expired",
      responses: unresolvedPair().responses,
    },
  ])(
    "persists $choice with its terminal state without counting a manual comparison",
    async ({ choice, expectedStatus, expectedEvent, responses }) => {
      const pair = unresolvedPair({ status: "GENERATING", responses });
      mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);
      mocks.tx.message.create.mockResolvedValue({ id: "assistant-1" });
      mocks.tx.messageMetrics.create.mockResolvedValue({});
      mocks.tx.modelExperimentPair.update.mockResolvedValue({
        ...pair,
        status: expectedStatus,
        experiment: experiment("ACTIVE"),
      });
      mocks.refreshSummary.mockResolvedValue(undefined);
      mocks.extractMemories.mockResolvedValue(undefined);

      await resolveModelComparisonPair({
        pairId: "pair-1",
        userId: "user-1",
        clerkId: "clerk-1",
        choice,
      });

      expect(mocks.tx.modelExperimentPair.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expectedStatus }),
        }),
      );
      expect(mocks.tx.modelExperimentParticipant.update).not.toHaveBeenCalled();
      expect(mocks.captureEvent).toHaveBeenCalledWith(
        expectedEvent,
        "clerk-1",
        expect.objectContaining({ choice }),
      );
    },
  );

  it("returns the canonical message for an idempotent repeated vote", async () => {
    const pair = unresolvedPair({
      vote: "TIE",
      canonicalMessage: { id: "assistant-1" },
    });
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);

    await expect(
      resolveModelComparisonPair({
        pairId: "pair-1",
        userId: "user-1",
        clerkId: "clerk-1",
        choice: "TIE",
      }),
    ).resolves.toMatchObject({
      pair,
      message: { id: "assistant-1" },
      created: false,
    });
    expect(mocks.tx.message.create).not.toHaveBeenCalled();
    expect(mocks.captureEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "unknown pair",
      pair: null,
      choice: "A" as const,
      error: "PAIR_NOT_FOUND",
    },
    {
      label: "different owner",
      pair: unresolvedPair({ userId: "other-user" }),
      choice: "A" as const,
      error: "PAIR_NOT_FOUND",
    },
    {
      label: "different repeated vote",
      pair: unresolvedPair({
        vote: "A",
        canonicalMessage: { id: "assistant-1" },
      }),
      choice: "B" as const,
      error: "PAIR_ALREADY_RESOLVED",
    },
    {
      label: "no completed response",
      pair: unresolvedPair({
        responses: [
          { ...unresolvedPair().responses[0], status: "FAILED", text: null },
        ],
      }),
      choice: "AUTO_SUCCESS" as const,
      error: "PAIR_NOT_READY",
    },
    {
      label: "manual vote before both responses complete",
      pair: unresolvedPair({ responses: [unresolvedPair().responses[0]] }),
      choice: "A" as const,
      error: "PAIR_NOT_READY",
    },
  ])("rejects $label", async ({ pair, choice, error }) => {
    mocks.tx.modelExperimentPair.findUnique.mockResolvedValue(pair);

    await expect(
      resolveModelComparisonPair({
        pairId: "pair-1",
        userId: "user-1",
        clerkId: "clerk-1",
        choice,
      }),
    ).rejects.toThrow(error);
    expect(mocks.tx.message.create).not.toHaveBeenCalled();
  });
});
