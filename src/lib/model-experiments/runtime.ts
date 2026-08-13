import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { Prisma } from "@/generated/prisma";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import {
  getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval,
} from "@/lib/ai/memory-approval";
import {
  executePreparedChatTurn,
  prepareChatTurn,
} from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { releaseAiUsageReservation, reserveAiUsage } from "@/lib/rate-limit";
import {
  captureModelComparisonEvent,
  MODEL_COMPARISON_EVENTS,
} from "./analytics";
import {
  checkStaticModelComparisonEligibility,
  getModelExperimentCandidate,
  isCheaplySafeModelComparisonMessage,
  isModelExperimentFlagEnabled,
  isSafeModelComparisonTurn,
} from "./eligibility";
import {
  createModelComparisonPair,
  finalizeFailedModelComparisonPair,
  finalizeReadyModelComparisonPair,
  markModelComparisonExposed,
  resolveModelComparisonPair,
} from "./service";
import type {
  AnthonUIMessage,
  ModelComparisonData,
  ModelComparisonSlot,
} from "./types";
import { generationConfigSchema } from "./validation";

const logger = createLogger("ai");

type RuntimeInput = {
  user: {
    id: string;
    clerkId: string;
    role: string;
    isGuest: boolean;
  };
  request: Request;
  chatId: string;
  conversationThreadId: string;
  sourceMessageId: string;
  userMessage: string;
  planId?: string | null;
  subscriptionStatus?: string;
  hasAttachments: boolean;
  effectiveEntitlements?: Parameters<
    typeof prepareChatTurn
  >[0]["effectiveEntitlements"];
  skipConversationHistory?: boolean;
  onPreparedTurnRejected?: (
    context: Pick<
      Awaited<ReturnType<typeof prepareChatTurn>>,
      "turnDecision" | "capabilityPlannerMode" | "classificationLatencyMs"
    >,
  ) => void;
};

function slotForVariant(
  pair: { slotAVariantId: string; slotBVariantId: string },
  variantId: string,
): ModelComparisonSlot {
  if (pair.slotAVariantId === variantId) return "A";
  if (pair.slotBVariantId === variantId) return "B";
  throw new Error("Variant is not part of comparison pair");
}

function initialData(
  pairId: string,
  noticeRequired: boolean,
): ModelComparisonData {
  return {
    pairId,
    noticeRequired,
    status: "generating",
    slots: {
      A: { status: "pending", text: "" },
      B: { status: "pending", text: "" },
    },
  };
}

function sumSuccessfulMetrics(successfulMetrics: AIMetrics[]): AIMetrics {
  if (successfulMetrics.length === 0) {
    throw new Error("Successful comparison metrics are required");
  }
  const sum = (pick: (metrics: AIMetrics) => number) =>
    successfulMetrics.reduce((total, metrics) => total + pick(metrics), 0);
  const hasReasoningTokens = successfulMetrics.some(
    (metrics) => metrics.reasoningTokens !== null,
  );
  const hasReasoningTime = successfulMetrics.some(
    (metrics) => metrics.reasoningTimeMs !== null,
  );

  return {
    model: successfulMetrics.map((metrics) => metrics.model).join(" + "),
    provider: null,
    inputTokens: sum((metrics) => metrics.inputTokens),
    outputTokens: sum((metrics) => metrics.outputTokens),
    reasoningTokens: hasReasoningTokens
      ? sum((metrics) => metrics.reasoningTokens ?? 0)
      : null,
    toolCalls: null,
    ragUsed: successfulMetrics.some((metrics) => metrics.ragUsed),
    ragChunksCount: sum((metrics) => metrics.ragChunksCount),
    costUsd: sum((metrics) => metrics.costUsd),
    generationTimeMs: sum((metrics) => metrics.generationTimeMs),
    reasoningTimeMs: hasReasoningTime
      ? sum((metrics) => metrics.reasoningTimeMs ?? 0)
      : null,
  };
}

async function getExistingComparisonPair(
  sourceMessageId: string,
  userId: string,
) {
  const pair = await prisma.modelExperimentPair.findUnique({
    where: { sourceMessageId },
    select: {
      id: true,
      userId: true,
      status: true,
      slotAVariantId: true,
      slotBVariantId: true,
      canonicalMessageId: true,
      responses: {
        select: {
          variantId: true,
          status: true,
          text: true,
          modelId: true,
          provider: true,
          inputTokens: true,
          outputTokens: true,
          reasoningTokens: true,
          costUsd: true,
          generationTimeMs: true,
        },
      },
    },
  });
  return pair?.userId === userId ? pair : null;
}

function retryableComparisonResponse() {
  return Response.json(
    {
      error: "Model comparison generation is already in progress",
      code: "MODEL_COMPARISON_IN_PROGRESS",
      retryable: true,
    },
    { status: 409, headers: { "Retry-After": "2" } },
  );
}

function metricsFromStoredResponse(
  response: NonNullable<
    Awaited<ReturnType<typeof getExistingComparisonPair>>
  >["responses"][number],
): AIMetrics {
  return {
    model: response.modelId,
    provider: response.provider,
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
    reasoningTokens: response.reasoningTokens,
    toolCalls: null,
    ragUsed: false,
    ragChunksCount: 0,
    costUsd: response.costUsd ?? 0,
    generationTimeMs: response.generationTimeMs ?? 0,
    reasoningTimeMs: null,
  };
}

function replayStoredComparison(
  pair: NonNullable<Awaited<ReturnType<typeof getExistingComparisonPair>>>,
  statusOverride?: ModelComparisonData["status"],
) {
  const responseByVariant = new Map(
    pair.responses.map((response) => [response.variantId, response]),
  );
  const slotA = responseByVariant.get(pair.slotAVariantId);
  const slotB = responseByVariant.get(pair.slotBVariantId);
  if (!slotA || !slotB) return null;
  const comparisonStatus =
    statusOverride ??
    (
      {
        READY: "ready",
        PARTIAL_FAILED: "partial_failed",
        RESOLVED: "resolved",
        EXPIRED: "resolved",
      } as const
    )[pair.status as "READY" | "PARTIAL_FAILED" | "RESOLVED" | "EXPIRED"];
  if (!comparisonStatus) return null;
  const slotState = (response: typeof slotA) => ({
    status:
      response.status === "COMPLETED"
        ? ("completed" as const)
        : response.status === "FAILED"
          ? ("failed" as const)
          : response.status === "STREAMING"
            ? ("streaming" as const)
            : ("pending" as const),
    text: response.status === "COMPLETED" ? (response.text ?? "") : "",
  });

  const data: ModelComparisonData = {
    pairId: pair.id,
    noticeRequired: false,
    status: comparisonStatus,
    slots: {
      A: slotState(slotA),
      B: slotState(slotB),
    },
  };
  const stream = createUIMessageStream<AnthonUIMessage>({
    async execute({ writer }) {
      writer.write({
        type: "data-modelComparison",
        id: pair.id,
        data,
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

async function recoverCompletedComparison(
  pair: NonNullable<Awaited<ReturnType<typeof getExistingComparisonPair>>>,
  input: RuntimeInput,
) {
  if (
    pair.responses.length !== 2 ||
    pair.responses.some(
      (response) =>
        response.status !== "COMPLETED" && response.status !== "FAILED",
    )
  ) {
    const reservation = await prisma.aiUsageReservation.findUnique({
      where: {
        userId_requestKey: {
          userId: input.user.id,
          requestKey: input.sourceMessageId,
        },
      },
      select: { status: true, expiresAt: true },
    });
    if (
      reservation?.status === "RESERVED" &&
      reservation.expiresAt > new Date()
    ) {
      return retryableComparisonResponse();
    }
    await finalizeFailedModelComparisonPair({
      pairId: pair.id,
      userId: input.user.id,
    });
    return null;
  }

  const successes = pair.responses.filter(
    (response) => response.status === "COMPLETED" && response.text,
  );
  if (successes.length === 2) {
    await finalizeReadyModelComparisonPair({
      pairId: pair.id,
      userId: input.user.id,
      metrics: sumSuccessfulMetrics(successes.map(metricsFromStoredResponse)),
    });
    return replayStoredComparison(pair, "ready");
  }
  if (successes.length === 1) {
    await resolveModelComparisonPair({
      pairId: pair.id,
      userId: input.user.id,
      clerkId: input.user.clerkId,
      choice: "AUTO_SUCCESS",
      usageMetrics: sumSuccessfulMetrics(
        successes.map(metricsFromStoredResponse),
      ),
    });
    return replayStoredComparison(pair, "partial_failed");
  }

  await finalizeFailedModelComparisonPair({
    pairId: pair.id,
    userId: input.user.id,
  });
  return null;
}

function deniedUsageResponse(reason: string, retryable: boolean) {
  return Response.json(
    { error: reason, code: "USAGE_RESERVATION_DENIED", retryable },
    {
      status: retryable ? 409 : 429,
      headers: retryable ? { "Retry-After": "2" } : undefined,
    },
  );
}

function isExpectedPairAdmissionRace(error: unknown) {
  return (
    error instanceof Error &&
    [
      "EXPERIMENT_NOT_ACTIVE",
      "EXPERIMENT_NOT_FOUND",
      "PARTICIPANT_NOT_ELIGIBLE",
    ].includes(error.message)
  );
}

async function hasAttributablePendingMemoryApproval(input: RuntimeInput) {
  if (
    input.user.isGuest ||
    !mightResolvePendingMemoryApproval(input.userMessage)
  ) {
    return false;
  }

  return Boolean(
    await getImmediatelyAttributableApproval({
      userId: input.user.id,
      conversationId: input.conversationThreadId,
      currentUserMessageId: input.sourceMessageId,
    }),
  );
}

export async function tryCreateModelComparisonResponse(
  input: RuntimeInput,
): Promise<Response | null> {
  const existingPair = await getExistingComparisonPair(
    input.sourceMessageId,
    input.user.id,
  );
  if (existingPair) {
    const replay = replayStoredComparison(existingPair);
    if (replay) return replay;
    if (existingPair.status === "FAILED") return null;
    if (existingPair.status === "GENERATING") {
      return recoverCompletedComparison(existingPair, input);
    }
    return deniedUsageResponse(
      "Model comparison is already in a terminal state",
      false,
    );
  }

  const countryCode =
    input.request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  if (
    !checkStaticModelComparisonEligibility({
      countryCode,
      channel: "WEB",
      clerkId: input.user.clerkId,
      isGuest: input.user.isGuest,
      role: input.user.role,
      hasAttachments: input.hasAttachments,
      responseMode: "text",
    })
  ) {
    return null;
  }
  if (!isCheaplySafeModelComparisonMessage(input.userMessage)) return null;
  if (await hasAttributablePendingMemoryApproval(input)) return null;

  const experiment = await getModelExperimentCandidate({
    userId: input.user.id,
    countryCode: countryCode ?? "",
  });
  if (!experiment) return null;
  if (!(await isModelExperimentFlagEnabled(experiment, input.user.clerkId))) {
    return null;
  }

  if (!input.effectiveEntitlements) return null;
  const usageReservation = await reserveAiUsage({
    userId: input.user.id,
    requestKey: input.sourceMessageId,
    limits: input.effectiveEntitlements.limits,
  });
  if (!usageReservation.allowed) {
    const racedPair = await getExistingComparisonPair(
      input.sourceMessageId,
      input.user.id,
    );
    if (racedPair) {
      const replay = replayStoredComparison(racedPair);
      if (replay) return replay;
      if (racedPair.status === "GENERATING") {
        return recoverCompletedComparison(racedPair, input);
      }
    }
    return deniedUsageResponse(
      usageReservation.reason,
      usageReservation.retryable,
    );
  }
  if (usageReservation.recovery || usageReservation.persistedAssistant) {
    return null;
  }
  const releaseReservation = async () => {
    try {
      await releaseAiUsageReservation({
        reservationId: usageReservation.reservationId,
        claimToken: usageReservation.claimToken,
        userId: input.user.id,
      });
    } catch (error) {
      logger.error(
        "model_comparison.usage_release_failed",
        "Failed releasing model comparison usage reservation",
        { error, sourceMessageId: input.sourceMessageId },
      );
    }
  };

  let prepared: Awaited<ReturnType<typeof prepareChatTurn>>;
  try {
    prepared = await prepareChatTurn({
      userId: input.user.id,
      abortSignal: input.request.signal,
      chatId: input.chatId,
      conversationThreadId: input.conversationThreadId,
      userMessageId: input.sourceMessageId,
      userMessage: input.userMessage,
      planId: input.planId,
      userRole: input.user.role,
      subscriptionStatus: input.subscriptionStatus,
      effectiveEntitlements: input.effectiveEntitlements,
      skipConversationHistory: input.skipConversationHistory,
    });
  } catch (error) {
    await releaseReservation();
    throw error;
  }
  const reusePreparedTurn = () =>
    input.onPreparedTurnRejected?.({
      turnDecision: prepared.turnDecision,
      capabilityPlannerMode: prepared.capabilityPlannerMode,
      classificationLatencyMs: prepared.classificationLatencyMs,
      ...(prepared.classifierModel
        ? { classifierModel: prepared.classifierModel }
        : {}),
      ...(prepared.classifierProvider
        ? { classifierProvider: prepared.classifierProvider }
        : {}),
    });
  if (!isSafeModelComparisonTurn(prepared.turnPlan, input.userMessage)) {
    await releaseReservation();
    reusePreparedTurn();
    return null;
  }

  let pairResult:
    | Awaited<ReturnType<typeof createModelComparisonPair>>
    | undefined;
  try {
    pairResult = await createModelComparisonPair({
      experimentId: experiment.id,
      userId: input.user.id,
      chatId: input.chatId,
      conversationThreadId: input.conversationThreadId,
      sourceMessageId: input.sourceMessageId,
      countryCode: countryCode ?? experiment.targetCountry,
      capabilityPlannerMode: prepared.capabilityPlannerMode,
      turnDecision: prepared.turnDecision,
      routingMode: prepared.plannedExecution.routingMode,
      plannedProfile: prepared.plannedExecution.plannedProfile,
    });
    await prisma.modelExperimentPair.update({
      where: { id: pairResult.pair.id },
      data: {
        promptMode: prepared.promptMode,
      },
    });
  } catch (error) {
    if (pairResult) {
      try {
        await finalizeFailedModelComparisonPair({
          pairId: pairResult.pair.id,
          userId: input.user.id,
        });
      } catch (finalizationError) {
        await releaseReservation();
        logger.error(
          "model_comparison.setup_finalize_failed",
          "Failed finalizing model comparison setup",
          { error: finalizationError, pairId: pairResult.pair.id },
        );
      }
    } else {
      await releaseReservation();
    }
    if (isExpectedPairAdmissionRace(error)) {
      reusePreparedTurn();
      return null;
    }
    throw error;
  }
  if (!pairResult) throw new Error("MODEL_COMPARISON_PAIR_NOT_CREATED");
  const { pair, noticeRequired } = pairResult;

  const state = initialData(pair.id, noticeRequired);
  const stream = createUIMessageStream<AnthonUIMessage>({
    async execute({ writer }) {
      let hasSuccessfulGeneration = false;
      let usageFinalized = false;
      const finalizeUnusedPair = async () => {
        if (usageFinalized) return;
        usageFinalized = true;
        try {
          await finalizeFailedModelComparisonPair({
            pairId: pair.id,
            userId: input.user.id,
          });
        } catch (finalizationError) {
          await releaseReservation();
          logger.error(
            "model_comparison.failure_finalize_failed",
            "Failed finalizing an unsuccessful model comparison",
            { error: finalizationError, pairId: pair.id },
          );
        }
      };

      try {
        writer.write({
          type: "data-modelComparison",
          id: pair.id,
          data: state,
        });
        await markModelComparisonExposed(pair.id, input.user.clerkId, {
          plan: input.planId ?? "free",
          tier: prepared.effectiveModelTier,
          prompt_mode: prepared.promptMode,
          routing_mode: prepared.plannedExecution.routingMode,
          eligible_profile: prepared.turnDecision.execution.eligibleProfile,
          planned_profile: prepared.plannedExecution.plannedProfile,
          task_kind: prepared.turnDecision.execution.taskKind,
          policy_version: prepared.turnDecision.execution.policyVersion,
        });

        const runVariant = async (
          response: (typeof pair.responses)[number],
        ) => {
          const variant = experiment.variants.find(
            (candidate) => candidate.id === response.variantId,
          );
          if (!variant) throw new Error("Missing comparison variant");
          const slot = slotForVariant(pair, variant.id);
          const config = generationConfigSchema.parse(variant.generationConfig);
          let text = "";
          let metrics: AIMetrics | undefined;
          let timeToFirstTokenMs: number | undefined;
          state.slots[slot] = { status: "streaming", text: "" };
          await prisma.modelExperimentResponse.update({
            where: { id: response.id },
            data: { status: "STREAMING" },
          });
          try {
            const result = executePreparedChatTurn({
              prepared,
              abortSignal: input.request.signal,
              modelId: variant.modelId,
              generationConfig: config,
              clerkId: input.user.clerkId,
              traceId: response.traceId,
              experimentId: experiment.id,
              pairId: pair.id,
              role: variant.role,
              onFirstToken(value) {
                timeToFirstTokenMs = value;
              },
              onFinish(result) {
                metrics = result.metrics;
              },
            });
            for await (const delta of result.textStream) {
              text += delta;
              state.slots[slot].text = text;
              writer.write({
                type: "data-modelComparisonDelta",
                data: { pairId: pair.id, slot, delta },
                transient: true,
              });
            }
            if (!text.trim() || !metrics) {
              throw new Error("EMPTY_MODEL_RESPONSE");
            }
            state.slots[slot] = { status: "completed", text };
            await prisma.modelExperimentResponse.update({
              where: { id: response.id },
              data: {
                status: "COMPLETED",
                text,
                parts: [{ type: "text", text }] as Prisma.InputJsonValue,
                inputTokens: metrics.inputTokens,
                outputTokens: metrics.outputTokens,
                reasoningTokens: metrics.reasoningTokens,
                costUsd: metrics.costUsd,
                generationTimeMs: metrics.generationTimeMs,
                timeToFirstTokenMs,
                firstTokenAt:
                  timeToFirstTokenMs === undefined
                    ? undefined
                    : new Date(
                        Date.now() -
                          metrics.generationTimeMs +
                          timeToFirstTokenMs,
                      ),
                completedAt: new Date(),
              },
            });
            return { variant, metrics, timeToFirstTokenMs };
          } catch (error) {
            state.slots[slot] = { status: "failed", text: "" };
            await prisma.modelExperimentResponse.update({
              where: { id: response.id },
              data: {
                status: "FAILED",
                errorCode:
                  error instanceof Error ? error.name : "UNKNOWN_ERROR",
                completedAt: new Date(),
              },
            });
            throw error;
          }
        };

        const settled = await Promise.allSettled(
          pair.responses.map(runVariant),
        );
        const successes = settled.filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            Awaited<ReturnType<typeof runVariant>>
          > => result.status === "fulfilled",
        );
        const successfulMetrics = successes.map(
          (result) => result.value.metrics,
        );
        hasSuccessfulGeneration = successfulMetrics.length > 0;
        if (successes.length === 2) {
          const controlResult = successes.find(
            (result) => result.value.variant.role === "CONTROL",
          )?.value;
          const candidateResult = successes.find(
            (result) => result.value.variant.role === "CANDIDATE",
          )?.value;
          state.status = "ready";
          await finalizeReadyModelComparisonPair({
            pairId: pair.id,
            userId: input.user.id,
            metrics: sumSuccessfulMetrics(successfulMetrics),
          });
          usageFinalized = true;
          writer.write({
            type: "data-modelComparison",
            id: pair.id,
            data: state,
          });
          captureModelComparisonEvent(
            MODEL_COMPARISON_EVENTS.ready,
            input.user.clerkId,
            {
              experiment_id: experiment.id,
              pair_id: pair.id,
              country: countryCode,
              prompt_mode: prepared.promptMode,
              control_model: experiment.variants.find(
                (variant) => variant.role === "CONTROL",
              )?.modelId,
              candidate_model: experiment.variants.find(
                (variant) => variant.role === "CANDIDATE",
              )?.modelId,
              control_input_tokens: controlResult?.metrics.inputTokens,
              control_output_tokens: controlResult?.metrics.outputTokens,
              control_cost_usd: controlResult?.metrics.costUsd,
              control_generation_time_ms:
                controlResult?.metrics.generationTimeMs,
              control_time_to_first_token_ms: controlResult?.timeToFirstTokenMs,
              candidate_input_tokens: candidateResult?.metrics.inputTokens,
              candidate_output_tokens: candidateResult?.metrics.outputTokens,
              candidate_cost_usd: candidateResult?.metrics.costUsd,
              candidate_generation_time_ms:
                candidateResult?.metrics.generationTimeMs,
              candidate_time_to_first_token_ms:
                candidateResult?.timeToFirstTokenMs,
              routing_mode: prepared.plannedExecution.routingMode,
              eligible_profile: prepared.turnDecision.execution.eligibleProfile,
              planned_profile: prepared.plannedExecution.plannedProfile,
              task_kind: prepared.turnDecision.execution.taskKind,
              policy_version: prepared.turnDecision.execution.policyVersion,
            },
          );
          return;
        }
        if (successes.length === 1) {
          state.status = "partial_failed";
          await resolveModelComparisonPair({
            pairId: pair.id,
            userId: input.user.id,
            clerkId: input.user.clerkId,
            choice: "AUTO_SUCCESS",
            usageMetrics: sumSuccessfulMetrics(successfulMetrics),
          });
          usageFinalized = true;
          writer.write({
            type: "data-modelComparison",
            id: pair.id,
            data: state,
          });
          return;
        }

        await finalizeUnusedPair();
        captureModelComparisonEvent(
          MODEL_COMPARISON_EVENTS.failed,
          input.user.clerkId,
          {
            experiment_id: experiment.id,
            pair_id: pair.id,
            country: countryCode,
            prompt_mode: prepared.promptMode,
            routing_mode: prepared.plannedExecution.routingMode,
            eligible_profile: prepared.turnDecision.execution.eligibleProfile,
            planned_profile: prepared.plannedExecution.plannedProfile,
            task_kind: prepared.turnDecision.execution.taskKind,
            policy_version: prepared.turnDecision.execution.policyVersion,
          },
        );
        throw new Error("MODEL_COMPARISON_FAILED");
      } catch (error) {
        if (!hasSuccessfulGeneration) await finalizeUnusedPair();
        throw error;
      }
    },
    onError(error) {
      logger.error(
        "model_comparison.stream_failed",
        "Paired comparison stream failed",
        { error, pairId: pair.id },
      );
      return "Non sono riuscito a generare le risposte. Riprova.";
    },
  });
  return createUIMessageStreamResponse({ stream });
}
