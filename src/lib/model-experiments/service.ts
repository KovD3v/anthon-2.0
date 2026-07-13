import { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { safelyRefreshConversationThreadSummary } from "@/lib/ai/thread-context";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";
import {
  captureModelComparisonEvent,
  MODEL_COMPARISON_EVENTS,
} from "./analytics";
import {
  assertConfigurationMutable,
  getLifecycleTarget,
  type ModelExperimentLifecycleAction,
} from "./lifecycle";
import { randomizeVariantSlots, selectVariantIdForChoice } from "./mapping";
import type { CreateModelExperimentInput } from "./validation";

const logger = createLogger("ai");
const DAY_MS = 24 * 60 * 60 * 1000;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function publicExperimentSnapshot(experiment: {
  key: string;
  name: string;
  status: string;
  posthogFlagKey: string;
  targetCountry: string;
  cooldownHours: number;
  perUserCap: number;
}) {
  return {
    key: experiment.key,
    name: experiment.name,
    status: experiment.status,
    posthogFlagKey: experiment.posthogFlagKey,
    targetCountry: experiment.targetCountry,
    cooldownHours: experiment.cooldownHours,
    perUserCap: experiment.perUserCap,
  };
}

export async function createModelExperiment(
  actorUserId: string,
  input: CreateModelExperimentInput,
) {
  return prisma.$transaction(async (tx) => {
    const experiment = await tx.modelExperiment.create({
      data: {
        key: input.key,
        name: input.name,
        posthogFlagKey: input.posthogFlagKey,
        targetCountry: input.targetCountry,
        cooldownHours: input.cooldownHours,
        perUserCap: input.perUserCap,
        createdByAdminId: actorUserId,
        variants: {
          create: [
            {
              role: "CONTROL",
              modelId: input.control.modelId,
              generationConfig: asJson(input.control.generationConfig),
            },
            {
              role: "CANDIDATE",
              modelId: input.candidate.modelId,
              generationConfig: asJson(input.candidate.generationConfig),
            },
          ],
        },
      },
      include: { variants: true },
    });
    await tx.modelExperimentAudit.create({
      data: {
        experimentId: experiment.id,
        actorUserId,
        action: "CREATED",
        after: asJson(publicExperimentSnapshot(experiment)),
      },
    });
    return experiment;
  });
}

export async function updateDraftModelExperiment(
  experimentId: string,
  actorUserId: string,
  input: Partial<Omit<CreateModelExperimentInput, "key">>,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.modelExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });
    if (!before) throw new Error("EXPERIMENT_NOT_FOUND");
    assertConfigurationMutable(before.status);

    const experiment = await tx.modelExperiment.update({
      where: { id: experimentId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.posthogFlagKey
          ? { posthogFlagKey: input.posthogFlagKey }
          : {}),
        ...(input.targetCountry ? { targetCountry: input.targetCountry } : {}),
        ...(input.cooldownHours ? { cooldownHours: input.cooldownHours } : {}),
        ...(input.perUserCap ? { perUserCap: input.perUserCap } : {}),
      },
      include: { variants: true },
    });

    for (const [role, variant] of [
      ["CONTROL", input.control],
      ["CANDIDATE", input.candidate],
    ] as const) {
      if (!variant) continue;
      await tx.modelExperimentVariant.update({
        where: { experimentId_role: { experimentId, role } },
        data: {
          modelId: variant.modelId,
          generationConfig: asJson(variant.generationConfig),
        },
      });
    }

    await tx.modelExperimentAudit.create({
      data: {
        experimentId,
        actorUserId,
        action: "UPDATED",
        before: asJson(publicExperimentSnapshot(before)),
        after: asJson(publicExperimentSnapshot(experiment)),
      },
    });
    return tx.modelExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });
  });
}

export async function deleteDraftModelExperiment(experimentId: string) {
  return prisma.$transaction(async (tx) => {
    const experiment = await tx.modelExperiment.findUnique({
      where: { id: experimentId },
      select: {
        status: true,
        _count: { select: { participants: true, pairs: true } },
      },
    });
    if (!experiment) throw new Error("EXPERIMENT_NOT_FOUND");
    if (
      experiment.status !== "DRAFT" ||
      experiment._count.participants > 0 ||
      experiment._count.pairs > 0
    ) {
      throw new Error("EXPERIMENT_DELETE_NOT_ALLOWED");
    }
    return tx.modelExperiment.delete({ where: { id: experimentId } });
  });
}

export async function transitionModelExperiment(
  experimentId: string,
  actorUserId: string,
  action: ModelExperimentLifecycleAction,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.modelExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });
    if (!before) throw new Error("EXPERIMENT_NOT_FOUND");
    const targetStatus = getLifecycleTarget(before.status, action);
    if (action === "READY") {
      const roles = new Set(before.variants.map((variant) => variant.role));
      if (
        before.variants.length !== 2 ||
        !roles.has("CONTROL") ||
        !roles.has("CANDIDATE") ||
        before.variants.some((variant) => {
          const config = variant.generationConfig as Record<string, unknown>;
          return config.fallbacks !== false || !variant.modelId.includes("/");
        })
      ) {
        throw new Error("READINESS_CHECK_FAILED");
      }
    }

    const now = new Date();
    const experiment = await tx.modelExperiment.update({
      where: { id: experimentId },
      data: {
        status: targetStatus,
        ...(action === "READY" ? { readyAt: now } : {}),
        ...(action === "ACTIVATE" || action === "RESUME"
          ? { activatedAt: before.activatedAt ?? now, pausedAt: null }
          : {}),
        ...(action === "PAUSE" ? { pausedAt: now } : {}),
        ...(action === "COMPLETE" ? { completedAt: now } : {}),
      },
      include: { variants: true },
    });
    await tx.modelExperimentAudit.create({
      data: {
        experimentId,
        actorUserId,
        action,
        before: asJson(publicExperimentSnapshot(before)),
        after: asJson(publicExperimentSnapshot(experiment)),
      },
    });
    return experiment;
  });
}

export async function createModelComparisonPair({
  experimentId,
  userId,
  chatId,
  conversationThreadId,
  sourceMessageId,
  countryCode,
  now = new Date(),
  random = Math.random,
}: {
  experimentId: string;
  userId: string;
  chatId: string;
  conversationThreadId: string;
  sourceMessageId: string;
  countryCode: string;
  now?: Date;
  random?: () => number;
}) {
  return prisma.$transaction(async (tx) => {
    const experiment = await tx.modelExperiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });
    if (!experiment || experiment.status !== "ACTIVE") {
      throw new Error("EXPERIMENT_NOT_ACTIVE");
    }
    const control = experiment.variants.find(
      (variant) => variant.role === "CONTROL",
    );
    const candidate = experiment.variants.find(
      (variant) => variant.role === "CANDIDATE",
    );
    if (!control || !candidate) throw new Error("EXPERIMENT_VARIANTS_INVALID");

    const participant = await tx.modelExperimentParticipant.upsert({
      where: { experimentId_userId: { experimentId, userId } },
      create: { experimentId, userId },
      update: {},
    });
    if (
      participant.attempts >= experiment.perUserCap ||
      (participant.nextEligibleAt && participant.nextEligibleAt > now)
    ) {
      throw new Error("PARTICIPANT_NOT_ELIGIBLE");
    }

    const { slotA, slotB } = randomizeVariantSlots(control, candidate, random);
    const nextEligibleAt = new Date(
      now.getTime() + experiment.cooldownHours * 60 * 60 * 1000,
    );
    const pair = await tx.modelExperimentPair.create({
      data: {
        experimentId,
        participantId: participant.id,
        userId,
        chatId,
        conversationThreadId,
        sourceMessageId,
        slotAVariantId: slotA.id,
        slotBVariantId: slotB.id,
        countryCode: countryCode.toUpperCase(),
        expiresAt: new Date(now.getTime() + DAY_MS),
        responses: {
          create: experiment.variants.map((variant) => ({
            variantId: variant.id,
            provider: variant.provider,
            modelId: variant.modelId,
            generationConfig: variant.generationConfig as Prisma.InputJsonValue,
            traceId: crypto.randomUUID(),
          })),
        },
      },
      include: { responses: true, slotAVariant: true, slotBVariant: true },
    });
    await tx.modelExperimentParticipant.update({
      where: { id: participant.id },
      data: {
        attempts: { increment: 1 },
        nextEligibleAt,
      },
    });
    return { pair, noticeRequired: participant.noticeState === "NOT_SHOWN" };
  });
}

export async function markModelComparisonExposed(
  pairId: string,
  clerkId: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
) {
  const pair = await prisma.$transaction(async (tx) => {
    const pair = await tx.modelExperimentPair.findUnique({
      where: { id: pairId },
      include: {
        participant: true,
        experiment: true,
        slotAVariant: true,
        slotBVariant: true,
      },
    });
    if (!pair || pair.exposedAt) return pair;
    const now = new Date();
    await tx.modelExperimentParticipant.update({
      where: { id: pair.participantId },
      data: { noticeState: "SHOWN", lastExposedAt: now },
    });
    return tx.modelExperimentPair.update({
      where: { id: pairId },
      data: { exposedAt: now },
      include: { experiment: true, slotAVariant: true, slotBVariant: true },
    });
  });
  if (pair) {
    captureModelComparisonEvent(MODEL_COMPARISON_EVENTS.exposed, clerkId, {
      experiment_id: pair.experimentId,
      pair_id: pair.id,
      slot_a_role: pair.slotAVariant.role,
      slot_b_role: pair.slotBVariant.role,
      slot_a_model: pair.slotAVariant.modelId,
      slot_b_model: pair.slotBVariant.modelId,
      country: pair.countryCode,
      ...properties,
    });
  }
}

export async function resolveModelComparisonPair({
  pairId,
  userId,
  clerkId,
  choice,
}: {
  pairId: string;
  userId: string;
  clerkId: string;
  choice: "A" | "B" | "TIE" | "AUTO_CONTROL" | "AUTO_SUCCESS";
}) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ModelExperimentPair" WHERE "id" = ${pairId} FOR UPDATE`,
    );
    const pair = await tx.modelExperimentPair.findUnique({
      where: { id: pairId },
      include: {
        experiment: true,
        participant: true,
        slotAVariant: true,
        slotBVariant: true,
        responses: true,
        canonicalMessage: true,
        sourceMessage: { select: { parts: true } },
      },
    });
    if (!pair || pair.userId !== userId) throw new Error("PAIR_NOT_FOUND");
    if (pair.canonicalMessage) {
      if (pair.vote === choice || (choice === "TIE" && pair.vote === "TIE")) {
        return { pair, message: pair.canonicalMessage, created: false };
      }
      throw new Error("PAIR_ALREADY_RESOLVED");
    }

    const completed = pair.responses.filter(
      (response) => response.status === "COMPLETED" && response.text,
    );
    if (completed.length === 0) throw new Error("PAIR_NOT_READY");
    if (choice === "A" || choice === "B" || choice === "TIE") {
      if (pair.status !== "READY" || completed.length !== 2) {
        throw new Error("PAIR_NOT_READY");
      }
    }

    const control =
      pair.slotAVariant.role === "CONTROL"
        ? pair.slotAVariant
        : pair.slotBVariant;
    const selectedVariantId = selectVariantIdForChoice({
      choice,
      slotAVariantId: pair.slotAVariantId,
      slotBVariantId: pair.slotBVariantId,
      controlVariantId: control.id,
      successfulVariantId: completed[0]?.variantId,
    });
    const response = completed.find(
      (item) => item.variantId === selectedVariantId,
    );
    if (!response?.text) throw new Error("SELECTED_RESPONSE_UNAVAILABLE");

    const message = await tx.message.create({
      data: {
        userId,
        chatId: pair.chatId,
        conversationThreadId: pair.conversationThreadId,
        channel: "WEB",
        direction: "OUTBOUND",
        role: "ASSISTANT",
        type: "TEXT",
        parts: (response.parts ?? [
          { type: "text", text: response.text },
        ]) as Prisma.InputJsonValue,
        metadata: asJson({ modelComparisonPairId: pair.id }),
        model: response.modelId,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        reasoningTokens: response.reasoningTokens,
        costUsd: response.costUsd,
        generationTimeMs: response.generationTimeMs,
      },
    });
    await tx.messageMetrics.create({
      data: {
        messageId: message.id,
        model: response.modelId,
        provider: response.provider,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: (response.inputTokens ?? 0) + (response.outputTokens ?? 0),
        reasoningTokens: response.reasoningTokens,
        costUsd: response.costUsd,
        generationTimeMs: response.generationTimeMs,
      },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await tx.dailyUsage.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        requestCount: 1,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        reasoningTokens: response.reasoningTokens ?? 0,
        totalCostUsd: response.costUsd ?? 0,
      },
      update: {
        requestCount: { increment: 1 },
        inputTokens: { increment: response.inputTokens ?? 0 },
        outputTokens: { increment: response.outputTokens ?? 0 },
        reasoningTokens: { increment: response.reasoningTokens ?? 0 },
        totalCostUsd: { increment: response.costUsd ?? 0 },
      },
    });
    const now = new Date();
    const updatedPair = await tx.modelExperimentPair.update({
      where: { id: pair.id },
      data: {
        status:
          choice === "AUTO_SUCCESS"
            ? "PARTIAL_FAILED"
            : choice === "AUTO_CONTROL"
              ? "EXPIRED"
              : "RESOLVED",
        vote: choice,
        selectedVariantId,
        canonicalMessageId: message.id,
        resolvedAt: now,
        contentPurgeAt: new Date(now.getTime() + 30 * DAY_MS),
      },
      include: { experiment: true },
    });
    if (choice === "A" || choice === "B" || choice === "TIE") {
      await tx.modelExperimentParticipant.update({
        where: { id: pair.participantId },
        data: { completedComparisons: { increment: 1 } },
      });
    }
    return {
      pair: updatedPair,
      message,
      created: true,
      response,
      slotARole: pair.slotAVariant.role,
      slotBRole: pair.slotBVariant.role,
      sourceText: getTextFromParts(pair.sourceMessage.parts),
      responseText: response.text,
    };
  });

  if (result.created) {
    captureModelComparisonEvent(
      choice === "AUTO_CONTROL"
        ? MODEL_COMPARISON_EVENTS.expired
        : choice === "AUTO_SUCCESS"
          ? MODEL_COMPARISON_EVENTS.partialFailure
          : MODEL_COMPARISON_EVENTS.voted,
      clerkId,
      {
        experiment_id: result.pair.experimentId,
        pair_id: result.pair.id,
        choice,
        slot_a_role: result.slotARole,
        slot_b_role: result.slotBRole,
        selected_model: result.response?.modelId,
        country: result.pair.countryCode,
        input_tokens: result.response?.inputTokens,
        output_tokens: result.response?.outputTokens,
        cost_usd: result.response?.costUsd,
        generation_time_ms: result.response?.generationTimeMs,
      },
    );
    void safelyRefreshConversationThreadSummary(
      result.pair.conversationThreadId,
      userId,
    ).catch((error) =>
      logger.warn(
        "model_comparison.summary_failed",
        "Comparison summary refresh failed",
        { error, pairId },
      ),
    );
    if (result.sourceText && result.responseText) {
      void extractAndSaveMemories(
        userId,
        result.sourceText,
        result.responseText,
      ).catch((error) =>
        logger.warn(
          "model_comparison.memory_failed",
          "Comparison memory extraction failed",
          { error, pairId },
        ),
      );
    }
  }
  return result;
}
