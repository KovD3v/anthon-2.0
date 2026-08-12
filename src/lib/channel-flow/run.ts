import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import type { CapabilityDecision } from "@/lib/ai/capability-arbitration";
import {
  type CapabilityUsage,
  normalizePreDeliveryCapabilityUsage,
} from "@/lib/ai/capability-usage";
import {
  type ExecutionRouteTrace,
  parseExecutionRouteTrace,
} from "@/lib/ai/execution-route-trace";
import {
  freezeTurnDecision,
  type TurnDecision,
} from "@/lib/ai/execution-routing";
import {
  getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval,
} from "@/lib/ai/memory-approval";
import type { MemoryRecallDecision } from "@/lib/ai/memory-recall-release";
import { resolveExactMemoryDeleteTarget } from "@/lib/ai/memory-target";
import { streamChat } from "@/lib/ai/orchestrator";
import { createToolStreamRedactor } from "@/lib/ai/tool-privacy";
import { serializeSafeTurnDecision } from "@/lib/ai/turn-decision-metadata";
import { createLogger } from "@/lib/logger";
import {
  reconcileAiUsageForRecovery,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/rate-limit";
import { persistAssistantOutput } from "./persistence";
import type {
  ChannelMessagePart,
  InboundContext,
  RunChannelFlowResult,
} from "./types";

const runLogger = createLogger("ai");

export class AssistantPersistenceError extends Error {
  constructor(readonly persistenceCause: unknown) {
    super("Assistant response persistence failed", { cause: persistenceCause });
    this.name = "AssistantPersistenceError";
  }
}

function normalizeParts(parts: ChannelMessagePart[]) {
  return parts.map((part) => {
    if (part.type === "text") {
      return { type: "text" as const, text: part.text || "" };
    }
    return {
      type: "file" as const,
      data: part.data,
      mimeType: part.mimeType,
      name: part.name,
      size: part.size,
      attachmentId: part.attachmentId,
    };
  });
}

function detectImages(parts: ChannelMessagePart[]) {
  return parts.some(
    (part) => part.type === "file" && part.mimeType?.startsWith("image/"),
  );
}

function detectAudio(parts: ChannelMessagePart[]) {
  return parts.some(
    (part) => part.type === "file" && part.mimeType?.startsWith("audio/"),
  );
}

function finishMetadata(
  metrics:
    | {
        inputTokens: number;
        outputTokens: number;
        generationTimeMs?: number;
        reasoningTimeMs?: number | null;
        ragAttempted?: boolean;
        ragUsed?: boolean;
        ragChunksCount?: number;
        capabilitiesUsed?: CapabilityUsage[];
      }
    | undefined,
) {
  if (!metrics) return undefined;
  return {
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    generationTimeMs: metrics.generationTimeMs,
    reasoningTimeMs: metrics.reasoningTimeMs ?? undefined,
    ragAttempted: metrics.ragAttempted ?? false,
    ragUsed: metrics.ragUsed ?? false,
    ragChunksCount: metrics.ragChunksCount ?? 0,
    capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
      metrics.capabilitiesUsed,
    ),
  };
}

function createPersistedResponse(
  text: string,
  metrics: NonNullable<RunChannelFlowResult["metrics"]>,
  includeTechnicalMetrics: boolean,
) {
  const streamId = crypto.randomUUID();
  const messageId = `safe-message-${streamId}`;
  const textId = `safe-text-${streamId}`;
  const stream = createUIMessageStream<UIMessage>({
    execute({ writer }) {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({
        type: "finish",
        finishReason: "stop",
        ...(includeTechnicalMetrics
          ? { messageMetadata: finishMetadata(metrics) }
          : {}),
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function isKnownCapabilityPlannerMode(
  value: unknown,
): value is "legacy" | "agentic" {
  return value === "legacy" || value === "agentic";
}

const TURN_DECISION_KEYS = ["version", "capabilities", "execution"] as const;
const CAPABILITY_DECISION_KEYS = [
  "rag",
  "webSearch",
  "webFetch",
  "memoryRead",
  "memoryWrite",
  "memoryDelete",
  "memoryDeleteTarget",
  "routineProposal",
  "userContext",
  "voiceOutput",
  "source",
  "reasonCodes",
] as const;
const EXECUTION_DECISION_KEYS = [
  "eligibleProfile",
  "taskKind",
  "contextDependency",
  "source",
  "confidenceBucket",
  "reasonCodes",
  "policyVersion",
  "classifierVersion",
] as const;

function hasExactOwnKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Reflect.ownKeys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key) => typeof key === "string" && expectedKeys.includes(key),
    )
  );
}

function isImmutableCapabilityDecision(
  value: unknown,
): value is CapabilityDecision {
  if (!value || typeof value !== "object") return false;

  const decision = value as Record<string, unknown>;
  const reasonCodes = decision.reasonCodes;
  const booleanCapabilities = [
    "rag",
    "webSearch",
    "webFetch",
    "memoryRead",
    "memoryWrite",
    "memoryDelete",
    "routineProposal",
    "userContext",
    "voiceOutput",
  ] as const;
  return (
    Object.isFrozen(value) &&
    Array.isArray(reasonCodes) &&
    Object.isFrozen(reasonCodes) &&
    reasonCodes.length <= 64 &&
    reasonCodes.every(
      (reasonCode) =>
        typeof reasonCode === "string" &&
        reasonCode.length > 0 &&
        reasonCode.length <= 128 &&
        /^[a-z0-9_]+$/.test(reasonCode),
    ) &&
    booleanCapabilities.every(
      (capability) => typeof decision[capability] === "boolean",
    ) &&
    (decision.source === "fallback" ||
      decision.source === "classifier" ||
      decision.source === "mixed") &&
    Object.hasOwn(decision, "memoryDeleteTarget") &&
    (decision.memoryDeleteTarget === null ||
      typeof decision.memoryDeleteTarget === "string")
  );
}

function hasValidCapabilityMetadata(
  decision: unknown,
  plannerMode: unknown,
): decision is CapabilityDecision {
  return (
    isSafeCapabilityDecision(decision) &&
    isKnownCapabilityPlannerMode(plannerMode)
  );
}

function hasValidRecoveryCapabilityMetadata(
  capabilityMetadataValid: unknown,
  plannerMode: unknown,
  decision: unknown,
): decision is CapabilityDecision {
  if (
    capabilityMetadataValid !== true ||
    !isKnownCapabilityPlannerMode(plannerMode)
  ) {
    return false;
  }
  if (plannerMode === "legacy") {
    return decision === undefined;
  }
  return hasValidCapabilityMetadata(decision, plannerMode);
}

const FALLBACK_CAPABILITY_DECISION = Object.freeze({
  rag: false,
  webSearch: false,
  webFetch: false,
  memoryRead: false,
  memoryWrite: false,
  memoryDelete: false,
  memoryDeleteTarget: null,
  routineProposal: false,
  userContext: false,
  voiceOutput: false,
  source: "fallback" as const,
  reasonCodes: Object.freeze(["classifier_unavailable"]),
}) as unknown as CapabilityDecision;

function isSafeCapabilityDecision(value: unknown): value is CapabilityDecision {
  if (
    !hasExactOwnKeys(value, CAPABILITY_DECISION_KEYS) ||
    !isImmutableCapabilityDecision(value)
  ) {
    return false;
  }
  try {
    serializeSafeTurnDecision(
      createStandardFallbackTurnDecision(value as CapabilityDecision),
    );
    return true;
  } catch {
    return false;
  }
}

function isDeepFrozenTurnDecision(value: unknown): value is TurnDecision {
  if (!hasExactOwnKeys(value, TURN_DECISION_KEYS) || !Object.isFrozen(value)) {
    return false;
  }
  const decision = value as TurnDecision;
  if (
    !hasExactOwnKeys(decision.capabilities, CAPABILITY_DECISION_KEYS) ||
    !hasExactOwnKeys(decision.execution, EXECUTION_DECISION_KEYS) ||
    !Object.isFrozen(decision.capabilities) ||
    !Object.isFrozen(decision.capabilities?.reasonCodes) ||
    !Object.isFrozen(decision.execution) ||
    !Object.isFrozen(decision.execution?.reasonCodes)
  ) {
    return false;
  }
  try {
    serializeSafeTurnDecision(decision);
    return true;
  } catch {
    return false;
  }
}

function createStandardFallbackTurnDecision(
  capabilities: CapabilityDecision = FALLBACK_CAPABILITY_DECISION,
): TurnDecision {
  return freezeTurnDecision({
    version: 1,
    capabilities,
    execution: {
      eligibleProfile: "standard",
      taskKind: "other",
      contextDependency: "deep",
      source: "fallback",
      confidenceBucket: "low",
      reasonCodes: ["runtime_invariant"],
      policyVersion: 1,
      classifierVersion: 1,
    },
  });
}

function isValidClassificationLatency(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function executionRouteMatchesDecision(
  route: ExecutionRouteTrace,
  decision: TurnDecision,
) {
  return (
    route.policyVersion === decision.execution.policyVersion &&
    route.classifierVersion === decision.execution.classifierVersion &&
    route.eligibleProfile === decision.execution.eligibleProfile &&
    route.taskKind === decision.execution.taskKind &&
    route.decisionSource === decision.execution.source &&
    route.confidenceBucket === decision.execution.confidenceBucket &&
    decision.execution.reasonCodes.every((reasonCode) =>
      route.reasonCodes.includes(reasonCode),
    )
  );
}

function validatedExecutionRoute(
  value: unknown,
  decision?: TurnDecision,
): ExecutionRouteTrace | null {
  const route = parseExecutionRouteTrace(value);
  if (!route || (decision && !executionRouteMatchesDecision(route, decision))) {
    return null;
  }
  return Object.freeze({
    ...route,
    reasonCodes: Object.freeze([...route.reasonCodes]),
    attempts: Object.freeze(
      route.attempts.map((attempt) => Object.freeze({ ...attempt })),
    ),
    ...(route.escalation
      ? { escalation: Object.freeze({ ...route.escalation }) }
      : {}),
  }) as unknown as ExecutionRouteTrace;
}

function reconstructRecoveryTurnDecision(
  capabilities: CapabilityDecision,
  route: ExecutionRouteTrace,
): TurnDecision {
  const contextDependency = route.reasonCodes.includes("deep_context")
    ? "deep"
    : route.eligibleProfile === "light"
      ? "recent"
      : "deep";
  return freezeTurnDecision({
    version: 1,
    capabilities,
    execution: {
      eligibleProfile: route.eligibleProfile,
      taskKind: route.taskKind,
      contextDependency,
      source: route.decisionSource,
      confidenceBucket: route.confidenceBucket,
      reasonCodes: route.reasonCodes,
      policyVersion: route.policyVersion,
      classifierVersion: route.classifierVersion,
    },
  });
}

function withCancellation<T>(
  stream: ReadableStream<T>,
  onCancel: (reason: unknown) => Promise<void>,
) {
  const reader = stream.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await onCancel(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export async function runChannelFlow(
  ctx: InboundContext,
): Promise<RunChannelFlowResult> {
  const includeTechnicalMetrics =
    ctx.execution?.includeTechnicalMetrics === true;
  const policyParts = ctx.options.allowAttachments
    ? ctx.parts
    : ctx.parts.filter((part) => part.type === "text");
  const normalizedParts = normalizeParts(policyParts);
  const mode = ctx.execution?.mode ?? "text";
  const isGuest = ctx.channel === "WEB_GUEST" || ctx.ai?.isGuest === true;
  const memoryEnabled = !isGuest && ctx.options.allowMemoryExtraction;
  let capabilityPlannerMode: "legacy" | "agentic" | undefined;
  let capabilityMetadataValid = false;
  let capabilityDecision: CapabilityDecision | undefined;
  let executionMetadataValid = false;
  let turnDecision: TurnDecision | undefined;
  let memoryRecallDecision: MemoryRecallDecision | undefined;
  const requestedPreparedTurnContext = ctx.ai?.preparedTurnContext;
  let preparedExecutionMetadataValid: boolean | undefined;
  let preparedCapabilityMetadataInvalid = false;
  let preparedTurnContext = requestedPreparedTurnContext;
  if (requestedPreparedTurnContext) {
    const preparedCapabilityMetadataValid = hasValidCapabilityMetadata(
      requestedPreparedTurnContext.turnDecision?.capabilities,
      requestedPreparedTurnContext.capabilityPlannerMode,
    );
    preparedCapabilityMetadataInvalid = !preparedCapabilityMetadataValid;
    preparedExecutionMetadataValid =
      preparedCapabilityMetadataValid &&
      isDeepFrozenTurnDecision(requestedPreparedTurnContext.turnDecision) &&
      isValidClassificationLatency(
        requestedPreparedTurnContext.classificationLatencyMs,
      );
    if (!preparedExecutionMetadataValid) {
      preparedTurnContext = {
        turnDecision: createStandardFallbackTurnDecision(
          preparedCapabilityMetadataValid
            ? requestedPreparedTurnContext.turnDecision.capabilities
            : FALLBACK_CAPABILITY_DECISION,
        ),
        capabilityPlannerMode: isKnownCapabilityPlannerMode(
          requestedPreparedTurnContext.capabilityPlannerMode,
        )
          ? requestedPreparedTurnContext.capabilityPlannerMode
          : "legacy",
        classificationLatencyMs: 0,
      };
    }
  }
  let executionMetadataInvalid = preparedExecutionMetadataValid === false;

  const applyTurnMetadata = ({
    candidateTurnDecision,
    candidateCapabilityDecision,
    candidateCapabilityPlannerMode,
    candidateClassificationLatencyMs,
    metrics,
  }: {
    candidateTurnDecision?: unknown;
    candidateCapabilityDecision?: unknown;
    candidateCapabilityPlannerMode?: unknown;
    candidateClassificationLatencyMs?: unknown;
    metrics?: RunChannelFlowResult["metrics"];
  }) => {
    const immutableTurnDecision = isDeepFrozenTurnDecision(
      candidateTurnDecision,
    )
      ? candidateTurnDecision
      : undefined;
    const candidateCapabilities =
      immutableTurnDecision?.capabilities ?? candidateCapabilityDecision;
    capabilityMetadataValid =
      !preparedCapabilityMetadataInvalid &&
      hasValidCapabilityMetadata(
        candidateCapabilities,
        candidateCapabilityPlannerMode,
      );
    if (capabilityMetadataValid) {
      capabilityDecision = candidateCapabilities as CapabilityDecision;
      capabilityPlannerMode = isKnownCapabilityPlannerMode(
        candidateCapabilityPlannerMode,
      )
        ? candidateCapabilityPlannerMode
        : undefined;
    } else {
      capabilityDecision = undefined;
      capabilityPlannerMode = undefined;
    }

    let currentExecutionMetadataValid = immutableTurnDecision !== undefined;
    if (
      candidateClassificationLatencyMs !== undefined &&
      !isValidClassificationLatency(candidateClassificationLatencyMs)
    ) {
      currentExecutionMetadataValid = false;
    }
    if (metrics?.executionRoute !== undefined) {
      currentExecutionMetadataValid = Boolean(
        immutableTurnDecision &&
          validatedExecutionRoute(
            metrics.executionRoute,
            immutableTurnDecision,
          ),
      );
    }
    if (!currentExecutionMetadataValid) {
      executionMetadataInvalid = true;
    }
    executionMetadataValid =
      currentExecutionMetadataValid && !executionMetadataInvalid;
    turnDecision = executionMetadataValid
      ? immutableTurnDecision
      : preparedExecutionMetadataValid === false && immutableTurnDecision
        ? immutableTurnDecision
        : createStandardFallbackTurnDecision(
            capabilityMetadataValid
              ? capabilityDecision
              : FALLBACK_CAPABILITY_DECISION,
          );
  };

  let finalMetrics: RunChannelFlowResult["metrics"];
  let persistence: RunChannelFlowResult["persistence"] =
    ctx.persistence?.saveAssistantMessage === false
      ? { status: "skipped" }
      : undefined;

  if (!ctx.rateLimit.allowed) {
    return {
      assistantText: "",
      capabilityMetadataValid: false,
      executionMetadataValid: false,
      persistence: { status: "skipped" },
      rateLimit: {
        status: "denied",
        upgradeInfo: ctx.rateLimit.upgradeInfo,
      },
    };
  }

  if (ctx.rateLimit.effectiveEntitlements && !ctx.userMessageId) {
    throw new Error(
      "A persisted inbound message is required for usage reservation",
    );
  }

  const reservationEntitlements = ctx.rateLimit.effectiveEntitlements;
  let usageReservation: Awaited<ReturnType<typeof reserveAiUsage>> | undefined;
  if (ctx.userMessageId && reservationEntitlements) {
    const requestKey = ctx.userMessageId;
    const reserve = () =>
      reserveAiUsage({
        userId: ctx.userId,
        requestKey,
        limits: reservationEntitlements.limits,
      });
    usageReservation = ctx.execution?.traceCollector
      ? await ctx.execution.traceCollector.measure("rate_limit", reserve)
      : await reserve();
  }
  if (usageReservation && !usageReservation.allowed) {
    return {
      assistantText: "",
      capabilityMetadataValid: false,
      executionMetadataValid: false,
      persistence: { status: "skipped" },
      rateLimit: {
        status: "denied",
        upgradeInfo: ctx.rateLimit.upgradeInfo,
        reason: usageReservation.reason,
        retryable: usageReservation.retryable,
      },
    };
  }

  const usageReservationId = usageReservation?.reservationId;
  const usageReservationClaimToken = usageReservation?.claimToken;
  type UsageReservationState =
    | "reserved"
    | "settling"
    | "settled"
    | "releasing";
  let usageReservationState: UsageReservationState =
    usageReservation?.recovery || usageReservation?.persistedAssistant
      ? "settled"
      : "reserved";
  let usageReservationRelease: Promise<boolean> | undefined;

  const releaseUsageReservationOnce = () => {
    if (usageReservationState === "releasing") {
      return usageReservationRelease ?? Promise.resolve(false);
    }
    if (
      usageReservationState !== "reserved" ||
      !usageReservationId ||
      !usageReservationClaimToken
    ) {
      return Promise.resolve(false);
    }
    usageReservationState = "releasing";
    usageReservationRelease = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const released = await releaseAiUsageReservation({
            reservationId: usageReservationId,
            claimToken: usageReservationClaimToken,
            userId: ctx.userId,
          });
          usageReservationState = "settled";
          return released;
        } catch (error) {
          lastError = error;
        }
      }

      usageReservationState = "reserved";
      usageReservationRelease = undefined;
      runLogger.error(
        "usage.reservation_release_failed",
        "Failed releasing AI usage reservation after retry",
        { error: lastError, userId: ctx.userId },
      );
      return false;
    })();
    return usageReservationRelease;
  };

  const beginUsageReservationSettlement = () => {
    if (!usageReservationId || !usageReservationClaimToken) return;
    if (usageReservationState === "releasing") {
      throw new Error("Usage reservation was released before settlement");
    }
    if (usageReservationState === "reserved") {
      usageReservationState = "settling";
    }
  };

  const markUsageReservationSettled = () => {
    if (usageReservationId && usageReservationClaimToken) {
      usageReservationState = "settled";
    }
  };

  const resetUsageReservationSettlement = () => {
    if (usageReservationState === "settling") {
      usageReservationState = "reserved";
    }
  };

  const persistGeneratedOutput = async ({
    text,
    metrics,
    usageAlreadyReconciled = false,
    allowMemoryExtraction,
  }: {
    text: string;
    metrics: NonNullable<RunChannelFlowResult["metrics"]>;
    usageAlreadyReconciled?: boolean;
    allowMemoryExtraction: boolean;
  }) => {
    if (ctx.persistence?.saveAssistantMessage === false) return undefined;
    if (!usageAlreadyReconciled) {
      beginUsageReservationSettlement();
    }
    try {
      const message = await persistAssistantOutput({
        userId: ctx.userId,
        chatId: ctx.chatId,
        conversationThreadId: ctx.conversationThreadId,
        userMessageId: ctx.userMessageId,
        channel: ctx.persistence?.channel ?? "WEB",
        text,
        userMessageText: ctx.userMessageText,
        metrics,
        metadata: ctx.persistence?.metadata,
        updateChatTimestamp: ctx.persistence?.updateChatTimestamp,
        revalidateTags: ctx.persistence?.revalidateTags,
        allowMemoryExtraction,
        allowConversationIndexing: allowMemoryExtraction,
        capabilityDecision: capabilityMetadataValid
          ? capabilityDecision
          : undefined,
        capabilityPlannerMode: capabilityMetadataValid
          ? capabilityPlannerMode
          : undefined,
        waitUntil: ctx.persistence?.waitUntil,
        usageReservationId,
        usageReservationClaimToken,
        usageAlreadyReconciled,
        externalInboundClaimToken: ctx.persistence?.externalInboundClaimToken,
        traceCollector: ctx.execution?.traceCollector,
      });
      persistence = { status: "saved", messageId: message.id };
      markUsageReservationSettled();
      return message;
    } catch (error) {
      persistence = { status: "failed", error };
      if (
        usageReservationId &&
        usageReservationClaimToken &&
        !usageAlreadyReconciled
      ) {
        try {
          await reconcileAiUsageForRecovery({
            reservationId: usageReservationId,
            claimToken: usageReservationClaimToken,
            userId: ctx.userId,
            text,
            metrics,
            capabilityPlannerMode: capabilityMetadataValid
              ? capabilityPlannerMode
              : undefined,
            capabilityDecision: capabilityMetadataValid
              ? capabilityDecision
              : undefined,
          });
          markUsageReservationSettled();
        } catch (recoveryError) {
          resetUsageReservationSettlement();
          runLogger.error(
            "usage.recovery_reconcile_failed",
            "Failed recording generated usage recovery",
            { error: recoveryError, userId: ctx.userId },
          );
        }
      }
      runLogger.error("persist.failed", "Failed persisting assistant output", {
        error,
      });
      throw new AssistantPersistenceError(error);
    }
  };

  if (usageReservation?.recovery) {
    const recovery = usageReservation.recovery;
    const recoveryCapabilityMetadataValid =
      hasValidRecoveryCapabilityMetadata(
        recovery.capabilityMetadataValid,
        recovery.capabilityPlannerMode,
        recovery.capabilityDecision,
      ) &&
      (recovery.metrics.memoryRecall === undefined ||
        recovery.memoryRecallDecision !== undefined);
    capabilityMetadataValid = recoveryCapabilityMetadataValid;
    if (
      recoveryCapabilityMetadataValid &&
      recovery.capabilityPlannerMode !== undefined
    ) {
      capabilityPlannerMode = recovery.capabilityPlannerMode;
      capabilityDecision = recovery.capabilityDecision;
      memoryRecallDecision = recovery.memoryRecallDecision;
    }
    const recoveryExecutionRoute =
      recovery.executionMetadataValid === true
        ? validatedExecutionRoute(
            recovery.executionRoute ?? recovery.metrics.executionRoute,
          )
        : null;
    executionMetadataValid = recoveryExecutionRoute !== null;
    const recoveryCapabilities =
      recoveryCapabilityMetadataValid && recovery.capabilityDecision
        ? recovery.capabilityDecision
        : FALLBACK_CAPABILITY_DECISION;
    turnDecision = recoveryExecutionRoute
      ? reconstructRecoveryTurnDecision(
          recoveryCapabilities,
          recoveryExecutionRoute,
        )
      : createStandardFallbackTurnDecision(recoveryCapabilities);
    const { executionRoute: _untrustedExecutionRoute, ...baseRecoveryMetrics } =
      recovery.metrics;
    const recoveryMetrics: NonNullable<RunChannelFlowResult["metrics"]> =
      recoveryExecutionRoute
        ? { ...baseRecoveryMetrics, executionRoute: recoveryExecutionRoute }
        : baseRecoveryMetrics;
    finalMetrics = recoveryMetrics;
    const message = await persistGeneratedOutput({
      text: recovery.text,
      metrics: recoveryMetrics,
      usageAlreadyReconciled: true,
      allowMemoryExtraction: memoryEnabled && recoveryCapabilityMetadataValid,
    });
    if (ctx.hooks?.onFinish) {
      await ctx.hooks.onFinish({
        text: recovery.text,
        metrics: recoveryMetrics,
      });
    }
    return {
      assistantText: mode === "text" ? recovery.text : "",
      metrics: recoveryMetrics,
      capabilityMetadataValid,
      executionMetadataValid,
      turnDecision,
      capabilityDecision,
      capabilityPlannerMode: capabilityMetadataValid
        ? capabilityPlannerMode
        : undefined,
      memoryRecallDecision,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      usageAlreadyReconciled: true,
      streamResult:
        mode === "stream" && message
          ? {
              textStream: (async function* () {
                yield recovery.text;
              })(),
              toUIMessageStreamResponse: () =>
                createPersistedResponse(
                  recovery.text,
                  recoveryMetrics,
                  includeTechnicalMetrics,
                ),
            }
          : undefined,
    };
  }

  if (usageReservation?.persistedAssistant) {
    const saved = usageReservation.persistedAssistant;
    if (!saved.text.trim()) {
      throw new Error("Persisted assistant response has no text");
    }
    finalMetrics = saved.metrics;
    persistence = { status: "saved", messageId: saved.messageId };
    return {
      assistantText: mode === "text" ? saved.text : "",
      metrics: saved.metrics,
      capabilityMetadataValid: false,
      executionMetadataValid: false,
      turnDecision: createStandardFallbackTurnDecision(),
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      usageAlreadyReconciled: true,
      streamResult:
        mode === "stream"
          ? {
              textStream: (async function* () {
                yield saved.text;
              })(),
              toUIMessageStreamResponse: () =>
                createPersistedResponse(
                  saved.text,
                  saved.metrics,
                  includeTechnicalMetrics,
                ),
            }
          : undefined,
    };
  }

  const generationAbortController = new AbortController();
  const requestAbortSignal = ctx.execution?.abortSignal;
  const forwardRequestAbort = () => {
    ctx.execution?.traceCollector?.markCancelled();
    generationAbortController.abort(requestAbortSignal?.reason);
  };
  generationAbortController.signal.addEventListener(
    "abort",
    () => {
      const release = releaseUsageReservationOnce();
      (ctx.execution?.waitUntil ?? ctx.persistence?.waitUntil)?.(release);
    },
    { once: true },
  );
  if (requestAbortSignal?.aborted) {
    forwardRequestAbort();
  } else {
    requestAbortSignal?.addEventListener("abort", forwardRequestAbort, {
      once: true,
    });
  }

  const detachRequestAbort = () =>
    requestAbortSignal?.removeEventListener("abort", forwardRequestAbort);

  const memoryAvailable = !isGuest && memoryEnabled;
  const [pendingMemoryApproval, resolvedMemoryTarget] = await Promise.all([
    memoryAvailable &&
    ctx.conversationThreadId &&
    ctx.userMessageId &&
    mightResolvePendingMemoryApproval(ctx.userMessageText)
      ? getImmediatelyAttributableApproval({
          userId: ctx.userId,
          conversationId: ctx.conversationThreadId,
          currentUserMessageId: ctx.userMessageId,
        })
      : Promise.resolve(null),
    memoryAvailable
      ? resolveExactMemoryDeleteTarget({
          userId: ctx.userId,
          userMessage: ctx.userMessageText,
          conversationThreadId: ctx.conversationThreadId,
          currentUserMessageId: ctx.userMessageId,
        })
      : Promise.resolve(null),
  ]);

  let streamResult: Awaited<ReturnType<typeof streamChat>>;
  try {
    streamResult = await streamChat({
      userId: ctx.userId,
      chatId: ctx.chatId,
      conversationThreadId: ctx.conversationThreadId,
      userMessageId: ctx.userMessageId,
      ...(pendingMemoryApproval ? { pendingMemoryApproval } : {}),
      resolvedMemoryTarget,
      userMessage: ctx.userMessageText,
      planId: ctx.ai?.planId,
      userRole: ctx.ai?.userRole,
      subscriptionStatus: ctx.ai?.subscriptionStatus,
      isGuest,
      hasImages: ctx.options.allowAttachments
        ? (ctx.ai?.hasImages ?? detectImages(policyParts))
        : false,
      hasAudio: ctx.options.allowAttachments
        ? (ctx.ai?.hasAudio ?? detectAudio(policyParts))
        : false,
      inputOrigin: ctx.ai?.inputOrigin,
      messageParts: normalizedParts,
      memoryEnabled,
      responseMode: ctx.options.allowVoiceOutput
        ? (ctx.ai?.responseMode ?? "text")
        : "text",
      voiceEnabled: ctx.options.allowVoiceOutput ? ctx.ai?.voiceEnabled : false,
      voiceUnavailableReason: ctx.options.allowVoiceOutput
        ? ctx.ai?.voiceUnavailableReason
        : undefined,
      effectiveEntitlements: ctx.rateLimit.effectiveEntitlements,
      skipConversationHistory: ctx.ai?.skipConversationHistory,
      preparedTurnContext,
      routineProposalAllowed: ctx.ai?.routineProposalAllowed !== false,
      traceCollector: ctx.execution?.traceCollector,
      abortSignal: generationAbortController.signal,
      onFinish: async ({
        text,
        metrics,
        turnDecision: streamedTurnDecision,
        capabilityDecision: streamedCapabilityDecision,
        capabilityPlannerMode: streamedCapabilityPlannerMode,
        memoryRecallDecision: streamedMemoryRecallDecision,
      }) => {
        applyTurnMetadata({
          candidateTurnDecision: streamedTurnDecision,
          candidateCapabilityDecision: streamedCapabilityDecision,
          candidateCapabilityPlannerMode: streamedCapabilityPlannerMode,
          metrics,
        });
        memoryRecallDecision = streamedMemoryRecallDecision;
        finalMetrics = metrics;
        generationAbortController.signal.throwIfAborted();
        if (!text.trim()) {
          if (usageReservationId && usageReservationClaimToken) {
            beginUsageReservationSettlement();
            try {
              await reconcileAiUsageForRecovery({
                reservationId: usageReservationId,
                claimToken: usageReservationClaimToken,
                userId: ctx.userId,
                text,
                metrics,
                capabilityPlannerMode: capabilityMetadataValid
                  ? capabilityPlannerMode
                  : undefined,
                capabilityDecision: capabilityMetadataValid
                  ? capabilityDecision
                  : undefined,
                memoryRecallDecision,
              });
              markUsageReservationSettled();
            } catch (error) {
              resetUsageReservationSettlement();
              throw error;
            }
          }
          throw new Error("AI generation returned an empty response");
        }

        await persistGeneratedOutput({
          text,
          metrics,
          allowMemoryExtraction: memoryEnabled && capabilityMetadataValid,
        });
        if (ctx.hooks?.onFinish) {
          try {
            await ctx.hooks.onFinish({ text, metrics });
          } catch (error) {
            runLogger.error("hook.onfinish_failed", "onFinish hook error", {
              error,
            });
          }
        }
      },
    });
    if (
      "turnDecision" in streamResult ||
      "capabilityDecision" in streamResult
    ) {
      applyTurnMetadata({
        candidateTurnDecision: streamResult.turnDecision,
        candidateCapabilityDecision: streamResult.capabilityDecision,
        candidateCapabilityPlannerMode: streamResult.capabilityPlannerMode,
        candidateClassificationLatencyMs: streamResult.classificationLatencyMs,
      });
      memoryRecallDecision = streamResult.memoryRecallDecision;
    }
  } catch (error) {
    detachRequestAbort();
    await releaseUsageReservationOnce();
    throw error;
  }

  if (mode === "stream") {
    return {
      assistantText: "",
      metrics: finalMetrics,
      capabilityMetadataValid,
      executionMetadataValid,
      turnDecision,
      capabilityDecision,
      capabilityPlannerMode: capabilityMetadataValid
        ? capabilityPlannerMode
        : undefined,
      memoryRecallDecision,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      streamResult: {
        textStream: streamResult.textStream,
        toUIMessageStreamResponse: () => {
          const streamable = streamResult as typeof streamResult & {
            toUIMessageStream?: (options: {
              sendFinish?: boolean;
              sendReasoning?: boolean;
            }) => ReadableStream<UIMessageChunk>;
          };
          if (!streamable.toUIMessageStream) {
            detachRequestAbort();
            generationAbortController.abort(
              new Error("Missing durable UI stream primitive"),
            );
            throw new Error(
              "AI stream does not expose the durable UI stream primitive",
            );
          }

          let sourceReader:
            | ReadableStreamDefaultReader<UIMessageChunk>
            | undefined;
          const redactToolStreamChunk = createToolStreamRedactor();
          const durableStream = createUIMessageStream<UIMessage>({
            async execute({ writer }) {
              let sourceErrored = false;
              try {
                const source = streamable.toUIMessageStream?.({
                  sendFinish: false,
                  sendReasoning: false,
                });
                if (!source) throw new Error("Missing UI stream");
                const reader = source.getReader();
                sourceReader = reader;
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value.type === "error" || value.type === "abort") {
                      sourceErrored = true;
                      if (value.type === "abort") {
                        ctx.execution?.traceCollector?.markCancelled();
                      }
                      if (!generationAbortController.signal.aborted) {
                        generationAbortController.abort(value.type);
                      }
                      await releaseUsageReservationOnce();
                    }
                    const safeChunk = redactToolStreamChunk(value);
                    if (safeChunk) {
                      writer.write(safeChunk as UIMessageChunk);
                    }
                  }
                } finally {
                  sourceReader = undefined;
                  reader.releaseLock();
                }

                if (sourceErrored || !finalMetrics) {
                  await releaseUsageReservationOnce();
                  return;
                }
                if (persistence?.status === "failed") {
                  throw persistence.error;
                }
                writer.write({
                  type: "finish",
                  finishReason: "stop",
                  ...(includeTechnicalMetrics
                    ? { messageMetadata: finishMetadata(finalMetrics) }
                    : {}),
                });
              } catch (error) {
                await releaseUsageReservationOnce();
                throw error;
              } finally {
                detachRequestAbort();
              }
            },
            onError: () =>
              "Non sono riuscito a salvare la risposta. Riprova senza perdere quota.",
          });
          const response = createUIMessageStreamResponse({
            stream: durableStream,
          });
          if (!response.body) return response;

          const cancellationAwareBody = withCancellation(
            response.body,
            async (reason) => {
              ctx.execution?.traceCollector?.markCancelled();
              if (!generationAbortController.signal.aborted) {
                generationAbortController.abort(reason);
              }
              await releaseUsageReservationOnce();
              await sourceReader?.cancel(reason).catch(() => undefined);
              detachRequestAbort();
            },
          );
          return new Response(cancellationAwareBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        },
      },
    };
  }

  let assistantText = "";
  try {
    for await (const chunk of streamResult.textStream) {
      assistantText += chunk;
    }
  } catch (error) {
    await releaseUsageReservationOnce();
    throw error;
  } finally {
    detachRequestAbort();
  }

  if (generationAbortController.signal.aborted) {
    await releaseUsageReservationOnce();
    generationAbortController.signal.throwIfAborted();
  }

  if (!finalMetrics && usageReservationId && usageReservationClaimToken) {
    await releaseUsageReservationOnce();
    throw new Error("AI generation completed without final metrics");
  }

  return {
    assistantText,
    metrics: finalMetrics,
    capabilityMetadataValid,
    executionMetadataValid,
    turnDecision,
    capabilityDecision,
    capabilityPlannerMode: capabilityMetadataValid
      ? capabilityPlannerMode
      : undefined,
    memoryRecallDecision,
    persistence,
    usageReservationId,
    usageReservationClaimToken,
    usageAlreadyReconciled: false,
  };
}
