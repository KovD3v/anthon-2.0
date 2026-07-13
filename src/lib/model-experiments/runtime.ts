import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { Prisma } from "@/generated/prisma";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import {
  executePreparedChatTurn,
  prepareChatTurn,
} from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
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

export async function tryCreateModelComparisonResponse(
  input: RuntimeInput,
): Promise<Response | null> {
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

  const experiment = await getModelExperimentCandidate({
    userId: input.user.id,
    countryCode: countryCode ?? "",
  });
  if (!experiment) return null;
  if (!(await isModelExperimentFlagEnabled(experiment, input.user.clerkId))) {
    return null;
  }

  const prepared = await prepareChatTurn({
    userId: input.user.id,
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
  if (!isSafeModelComparisonTurn(prepared.turnPlan, input.userMessage))
    return null;

  const { pair, noticeRequired } = await createModelComparisonPair({
    experimentId: experiment.id,
    userId: input.user.id,
    chatId: input.chatId,
    conversationThreadId: input.conversationThreadId,
    sourceMessageId: input.sourceMessageId,
    countryCode: countryCode ?? experiment.targetCountry,
  });
  await prisma.modelExperimentPair.update({
    where: { id: pair.id },
    data: { promptMode: prepared.promptMode },
  });

  const state = initialData(pair.id, noticeRequired);
  const stream = createUIMessageStream<AnthonUIMessage>({
    async execute({ writer }) {
      writer.write({
        type: "data-modelComparison",
        id: pair.id,
        data: state,
      });
      await markModelComparisonExposed(pair.id, input.user.clerkId, {
        plan: input.planId ?? "free",
        tier: prepared.effectiveModelTier,
        prompt_mode: prepared.promptMode,
      });

      const runVariant = async (response: (typeof pair.responses)[number]) => {
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
          if (!text.trim() || !metrics) throw new Error("EMPTY_MODEL_RESPONSE");
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
              errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
              completedAt: new Date(),
            },
          });
          throw error;
        }
      };

      const settled = await Promise.allSettled(pair.responses.map(runVariant));
      const successes = settled.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof runVariant>>
        > => result.status === "fulfilled",
      );
      if (successes.length === 2) {
        const controlResult = successes.find(
          (result) => result.value.variant.role === "CONTROL",
        )?.value;
        const candidateResult = successes.find(
          (result) => result.value.variant.role === "CANDIDATE",
        )?.value;
        state.status = "ready";
        await prisma.modelExperimentPair.update({
          where: { id: pair.id },
          data: { status: "READY", readyAt: new Date() },
        });
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
            control_generation_time_ms: controlResult?.metrics.generationTimeMs,
            control_time_to_first_token_ms: controlResult?.timeToFirstTokenMs,
            candidate_input_tokens: candidateResult?.metrics.inputTokens,
            candidate_output_tokens: candidateResult?.metrics.outputTokens,
            candidate_cost_usd: candidateResult?.metrics.costUsd,
            candidate_generation_time_ms:
              candidateResult?.metrics.generationTimeMs,
            candidate_time_to_first_token_ms:
              candidateResult?.timeToFirstTokenMs,
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
        });
        writer.write({
          type: "data-modelComparison",
          id: pair.id,
          data: state,
        });
        return;
      }

      await prisma.modelExperimentPair.update({
        where: { id: pair.id },
        data: { status: "FAILED", resolvedAt: new Date() },
      });
      captureModelComparisonEvent(
        MODEL_COMPARISON_EVENTS.failed,
        input.user.clerkId,
        {
          experiment_id: experiment.id,
          pair_id: pair.id,
          country: countryCode,
          prompt_mode: prepared.promptMode,
        },
      );
      throw new Error("MODEL_COMPARISON_FAILED");
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
