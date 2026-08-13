import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import {
  type CapabilityDecision,
  freezeCapabilityDecision,
} from "@/lib/ai/capability-arbitration";
import { normalizePreDeliveryCapabilityUsage } from "@/lib/ai/capability-usage";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import {
  type ExecutionRouteTrace,
  parseExecutionRouteTrace,
} from "@/lib/ai/execution-route-trace";
import type { MemoryRecallDecision } from "@/lib/ai/memory-recall-release";
import { prisma } from "@/lib/db";
import type { RateLimits } from "./types";

const AI_RESERVATION_LEASE_MS = 10 * 60 * 1000;
const RECOVERY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECOVERY_METRICS_BYTES = 512 * 1024;
const MAX_RECOVERY_TEXT_CHARS = 128 * 1024;

type TransactionClient = Pick<
  typeof prisma,
  "$queryRaw" | "aiUsageReservation" | "dailyUsage"
>;

export interface AiUsageRecovery {
  text: string;
  metrics: AIMetrics;
  capabilityMetadataValid: boolean;
  executionMetadataValid: boolean;
  executionRoute?: ExecutionRouteTrace;
  capabilityPlannerMode?: "legacy" | "agentic";
  capabilityDecision?: CapabilityDecision;
  memoryRecallDecision?: MemoryRecallDecision;
}

export interface AiUsagePersistedAssistant
  extends Pick<AiUsageRecovery, "text" | "metrics"> {
  messageId: string;
}

export type AiUsageReservationResult =
  | {
      allowed: true;
      reservationId: string;
      claimToken: string;
      recovery?: AiUsageRecovery;
      persistedAssistant?: AiUsagePersistedAssistant;
    }
  | {
      allowed: false;
      reason:
        | "Daily request limit reached"
        | "Daily input token limit reached"
        | "Daily output token limit reached"
        | "Daily spending limit reached"
        | "Generation already in progress"
        | "Generation already accounted for";
      retryable: boolean;
    };

function getUTCDateOnly(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function lockUser(tx: TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error("Cannot reserve usage for an unknown user");
  }
}

function parseRecovery(
  text: string | null,
  metrics: Prisma.JsonValue | null,
): AiUsageRecovery | undefined {
  if (
    !text ||
    !metrics ||
    typeof metrics !== "object" ||
    Array.isArray(metrics)
  ) {
    return undefined;
  }
  const {
    providerMetadata: _providerMetadata,
    reasoningContent: _reasoningContent,
    capabilityPlanner: rawCapabilityPlanner,
    executionRoute: rawExecutionRoute,
    ...safeMetrics
  } = metrics as Record<string, unknown>;
  const capabilityPlanner =
    parseRecoveryCapabilityPlanner(rawCapabilityPlanner);
  const executionRoute = parseFrozenExecutionRoute(rawExecutionRoute);
  return {
    text,
    metrics: {
      ...safeMetrics,
      capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
        safeMetrics.capabilitiesUsed,
      ),
    } as unknown as AIMetrics,
    capabilityMetadataValid: capabilityPlanner !== undefined,
    executionMetadataValid: executionRoute !== undefined,
    executionRoute,
    capabilityPlannerMode: capabilityPlanner?.mode,
    capabilityDecision: capabilityPlanner?.decision,
    memoryRecallDecision: parseRecoveryMemoryRecall(safeMetrics.memoryRecall),
  };
}

function parseFrozenExecutionRoute(
  value: unknown,
): ExecutionRouteTrace | undefined {
  const parsed = parseExecutionRouteTrace(value);
  if (!parsed) return undefined;

  return Object.freeze({
    ...parsed,
    reasonCodes: Object.freeze([...parsed.reasonCodes]),
    attempts: Object.freeze(
      parsed.attempts.map((attempt) => Object.freeze({ ...attempt })),
    ),
    ...(parsed.escalation
      ? { escalation: Object.freeze({ ...parsed.escalation }) }
      : {}),
  }) as unknown as ExecutionRouteTrace;
}

function parseRecoveryMemoryRecall(
  value: unknown,
): MemoryRecallDecision | undefined {
  if (!isRecord(value)) return undefined;
  const {
    mode,
    reason,
    factCount,
    evidenceCount,
    factRecallMs,
    conversationRecallMs,
    degraded,
  } = value;
  if (
    (mode !== "off" && mode !== "shadow" && mode !== "active") ||
    typeof reason !== "string" ||
    reason.length > 128 ||
    !Number.isInteger(factCount) ||
    !Number.isInteger(evidenceCount) ||
    !Number.isInteger(factRecallMs) ||
    !Number.isInteger(conversationRecallMs) ||
    typeof degraded !== "boolean"
  )
    return undefined;
  return Object.freeze({ mode, reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

const recoveryBooleanCapabilities = [
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

const MAX_RECOVERY_REASON_CODES = 64;
const MAX_RECOVERY_REASON_CODE_CHARS = 128;

function isSafeRecoveryReasonCodes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_RECOVERY_REASON_CODES &&
    value.every(
      (reasonCode) =>
        typeof reasonCode === "string" &&
        reasonCode.length > 0 &&
        reasonCode.length <= MAX_RECOVERY_REASON_CODE_CHARS &&
        /^[a-z0-9_]+$/.test(reasonCode),
    )
  );
}

function parseRecoveryCapabilityPlanner(
  value: unknown,
): { mode: "legacy" | "agentic"; decision?: CapabilityDecision } | undefined {
  if (!isRecord(value)) return undefined;

  const mode = value.mode;
  if (mode !== "legacy" && mode !== "agentic") return undefined;
  if (mode === "legacy") {
    return Object.hasOwn(value, "decision") ? undefined : { mode };
  }

  const decision = value.decision;
  if (
    !isRecord(decision) ||
    !recoveryBooleanCapabilities.every((key) => isBoolean(decision[key])) ||
    !isSafeRecoveryReasonCodes(decision.reasonCodes)
  ) {
    return undefined;
  }

  const source = decision.source;
  if (source !== "fallback" && source !== "classifier" && source !== "mixed") {
    return undefined;
  }

  return {
    mode,
    decision: freezeCapabilityDecision({
      rag: decision.rag as boolean,
      webSearch: decision.webSearch as boolean,
      webFetch: decision.webFetch as boolean,
      memoryRead: decision.memoryRead as boolean,
      memoryWrite: decision.memoryWrite as boolean,
      memoryDelete: decision.memoryDelete as boolean,
      memoryDeleteTarget: null,
      routineProposal: decision.routineProposal as boolean,
      userContext: decision.userContext as boolean,
      voiceOutput: decision.voiceOutput as boolean,
      source,
      reasonCodes: decision.reasonCodes,
    }),
  };
}

function textFromMessageParts(parts: Prisma.JsonValue | null): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .flatMap((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        Array.isArray(part) ||
        part.type !== "text" ||
        typeof part.text !== "string"
      ) {
        return [];
      }
      return [part.text];
    })
    .join("");
}

type ReservationDecisionOutcome =
  | "reserved"
  | "in_progress"
  | "request_limit"
  | "input_limit"
  | "output_limit"
  | "cost_limit"
  | "recovered"
  | "reconciled"
  | "accounted";

interface ReservationDecisionRow {
  outcome: ReservationDecisionOutcome;
  reservationId: string | null;
  claimToken: string | null;
  recoveryText: string | null;
  recoveryMetrics: Prisma.JsonValue | null;
  assistantMessageId: string | null;
}

function nullableLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

async function decideAndReserveAiUsage(
  tx: TransactionClient,
  {
    userId,
    requestKey,
    today,
    now,
    expiresAt,
    limits,
    reservationId,
    claimToken,
  }: {
    userId: string;
    requestKey: string;
    today: Date;
    now: Date;
    expiresAt: Date;
    limits: RateLimits;
    reservationId: string;
    claimToken: string;
  },
): Promise<ReservationDecisionRow> {
  const rows = await tx.$queryRaw<ReservationDecisionRow[]>(Prisma.sql`
    WITH existing AS (
      SELECT
        "id",
        "claimToken",
        "status",
        "recoveryText",
        "recoveryMetrics",
        "recoveryExpiresAt",
        "assistantMessageId",
        "expiresAt"
      FROM "AiUsageReservation"
      WHERE "userId" = ${userId}
        AND "requestKey" = ${requestKey}
    ),
    usage_totals AS (
      SELECT
        COALESCE(MAX("requestCount"), 0)::integer AS request_count,
        COALESCE(MAX("inputTokens"), 0)::integer AS input_tokens,
        COALESCE(MAX("outputTokens"), 0)::integer AS output_tokens,
        COALESCE(MAX("totalCostUsd"), 0)::double precision AS total_cost_usd
      FROM "DailyUsage"
      WHERE "userId" = ${userId}
        AND "date" = ${today}::date
    ),
    active_totals AS (
      SELECT
        COALESCE(SUM("reservedRequests"), 0)::integer AS reserved_requests,
        COALESCE(SUM("reservedInputTokens"), 0)::integer AS reserved_input_tokens,
        COALESCE(SUM("reservedOutputTokens"), 0)::integer AS reserved_output_tokens,
        COALESCE(SUM("reservedCostUsd"), 0)::double precision AS reserved_cost_usd,
        COUNT(*)::integer AS active_count
      FROM "AiUsageReservation"
      WHERE "userId" = ${userId}
        AND "date" = ${today}::date
        AND "status" = 'RESERVED'::"AiUsageReservationStatus"
        AND "expiresAt" > ${now}
        AND "requestKey" <> ${requestKey}
    ),
    limits AS (
      SELECT
        CAST(${nullableLimit(limits.maxRequestsPerDay)} AS double precision) AS max_requests,
        CAST(${nullableLimit(limits.maxInputTokensPerDay)} AS double precision) AS max_input_tokens,
        CAST(${nullableLimit(limits.maxOutputTokensPerDay)} AS double precision) AS max_output_tokens,
        CAST(${nullableLimit(limits.maxCostPerDay)} AS double precision) AS max_cost_usd,
        CAST(${Number.isFinite(limits.maxRequestsPerDay) || Number.isFinite(limits.maxInputTokensPerDay) || Number.isFinite(limits.maxOutputTokensPerDay) || Number.isFinite(limits.maxCostPerDay)} AS boolean) AS has_finite_budget
    ),
    totals AS (
      SELECT
        usage_totals.request_count + active_totals.reserved_requests AS effective_requests,
        usage_totals.input_tokens + active_totals.reserved_input_tokens AS effective_input_tokens,
        usage_totals.output_tokens + active_totals.reserved_output_tokens AS effective_output_tokens,
        usage_totals.total_cost_usd + active_totals.reserved_cost_usd AS effective_cost_usd,
        active_totals.active_count,
        limits.max_requests,
        limits.max_input_tokens,
        limits.max_output_tokens,
        limits.max_cost_usd,
        limits.has_finite_budget
      FROM usage_totals
      CROSS JOIN active_totals
      CROSS JOIN limits
    ),
    decision AS (
      SELECT
        CASE
          WHEN existing."status" = 'RECONCILED'::"AiUsageReservationStatus"
            AND existing."recoveryText" IS NOT NULL
            AND existing."recoveryMetrics" IS NOT NULL
            AND (
              existing."recoveryExpiresAt" IS NULL
              OR existing."recoveryExpiresAt" > ${now}
            )
            THEN 'recovered'
          WHEN existing."status" = 'RECONCILED'::"AiUsageReservationStatus"
            AND existing."assistantMessageId" IS NOT NULL
            THEN 'reconciled'
          WHEN existing."status" = 'RECONCILED'::"AiUsageReservationStatus"
            THEN 'accounted'
          WHEN existing."status" = 'RESERVED'::"AiUsageReservationStatus"
            AND existing."expiresAt" > ${now}
            THEN 'in_progress'
          WHEN totals.active_count > 0 AND totals.has_finite_budget
            THEN 'in_progress'
          WHEN totals.max_requests IS NOT NULL
            AND totals.effective_requests >= totals.max_requests
            THEN 'request_limit'
          WHEN totals.max_input_tokens IS NOT NULL
            AND totals.effective_input_tokens >= totals.max_input_tokens
            THEN 'input_limit'
          WHEN totals.max_output_tokens IS NOT NULL
            AND totals.effective_output_tokens >= totals.max_output_tokens
            THEN 'output_limit'
          WHEN totals.max_cost_usd IS NOT NULL
            AND totals.effective_cost_usd >= totals.max_cost_usd
            THEN 'cost_limit'
          ELSE 'reserved'
        END::text AS "outcome",
        existing."id" AS existing_id,
        existing."claimToken" AS existing_claim_token,
        existing."recoveryText" AS existing_recovery_text,
        existing."recoveryMetrics" AS existing_recovery_metrics,
        existing."assistantMessageId" AS existing_assistant_message_id
      FROM totals
      LEFT JOIN existing ON TRUE
    ),
    reservation_values AS (
      SELECT
        ${reservationId}::text AS reservation_id,
        ${userId}::text AS user_id,
        ${requestKey}::text AS request_key,
        ${today}::date AS reservation_date,
        ${claimToken}::text AS claim_token,
        'RESERVED'::"AiUsageReservationStatus" AS reservation_status,
        1::integer AS reserved_requests,
        CASE
          WHEN totals.max_input_tokens IS NULL THEN 0
          ELSE GREATEST(0::double precision, FLOOR(totals.max_input_tokens - totals.effective_input_tokens))::integer
        END AS reserved_input_tokens,
        CASE
          WHEN totals.max_output_tokens IS NULL THEN 0
          ELSE GREATEST(0::double precision, FLOOR(totals.max_output_tokens - totals.effective_output_tokens))::integer
        END AS reserved_output_tokens,
        CASE
          WHEN totals.max_cost_usd IS NULL THEN 0::double precision
          ELSE GREATEST(0::double precision, totals.max_cost_usd - totals.effective_cost_usd)
        END AS reserved_cost_usd,
        ${expiresAt}::timestamp AS expires_at,
        ${now}::timestamp AS written_at
      FROM totals
    ),
    upserted AS (
      INSERT INTO "AiUsageReservation" (
        "id",
        "userId",
        "date",
        "requestKey",
        "claimToken",
        "status",
        "reservedRequests",
        "reservedInputTokens",
        "reservedOutputTokens",
        "reservedCostUsd",
        "actualInputTokens",
        "actualOutputTokens",
        "actualReasoningTokens",
        "actualCostUsd",
        "recoveryText",
        "recoveryMetrics",
        "recoveryExpiresAt",
        "assistantMessageId",
        "expiresAt",
        "reconciledAt",
        "releasedAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        reservation_values.reservation_id,
        reservation_values.user_id,
        reservation_values.reservation_date,
        reservation_values.request_key,
        reservation_values.claim_token,
        reservation_values.reservation_status,
        reservation_values.reserved_requests,
        reservation_values.reserved_input_tokens,
        reservation_values.reserved_output_tokens,
        reservation_values.reserved_cost_usd,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        reservation_values.expires_at,
        NULL,
        NULL,
        reservation_values.written_at,
        reservation_values.written_at
      FROM reservation_values
      INNER JOIN decision ON decision."outcome" = 'reserved'
      ON CONFLICT ("userId", "requestKey") DO UPDATE SET
        "date" = EXCLUDED."date",
        "claimToken" = EXCLUDED."claimToken",
        "status" = EXCLUDED."status",
        "reservedRequests" = EXCLUDED."reservedRequests",
        "reservedInputTokens" = EXCLUDED."reservedInputTokens",
        "reservedOutputTokens" = EXCLUDED."reservedOutputTokens",
        "reservedCostUsd" = EXCLUDED."reservedCostUsd",
        "actualInputTokens" = EXCLUDED."actualInputTokens",
        "actualOutputTokens" = EXCLUDED."actualOutputTokens",
        "actualReasoningTokens" = EXCLUDED."actualReasoningTokens",
        "actualCostUsd" = EXCLUDED."actualCostUsd",
        "recoveryText" = EXCLUDED."recoveryText",
        "recoveryMetrics" = EXCLUDED."recoveryMetrics",
        "recoveryExpiresAt" = EXCLUDED."recoveryExpiresAt",
        "assistantMessageId" = EXCLUDED."assistantMessageId",
        "expiresAt" = EXCLUDED."expiresAt",
        "reconciledAt" = EXCLUDED."reconciledAt",
        "releasedAt" = EXCLUDED."releasedAt",
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id", "claimToken"
    )
    SELECT
      decision."outcome" AS "outcome",
      COALESCE(upserted."id", decision.existing_id) AS "reservationId",
      COALESCE(upserted."claimToken", decision.existing_claim_token) AS "claimToken",
      decision.existing_recovery_text AS "recoveryText",
      decision.existing_recovery_metrics AS "recoveryMetrics",
      decision.existing_assistant_message_id AS "assistantMessageId"
    FROM decision
    LEFT JOIN upserted ON TRUE
  `);

  if (rows.length !== 1 || !rows[0]) {
    throw new Error("Usage reservation decision returned an invalid result");
  }

  const row = rows[0];
  if (
    ![
      "reserved",
      "in_progress",
      "request_limit",
      "input_limit",
      "output_limit",
      "cost_limit",
      "recovered",
      "reconciled",
      "accounted",
    ].includes(row.outcome)
  ) {
    throw new Error("Usage reservation decision returned an unknown outcome");
  }
  return row;
}

async function loadPersistedAssistant(
  tx: TransactionClient,
  reservationId: string,
  assistantMessageId: string,
): Promise<AiUsagePersistedAssistant | undefined> {
  const existing = await tx.aiUsageReservation.findUnique({
    where: { id: reservationId },
    include: {
      assistantMessage: {
        include: { metrics: true },
      },
    },
  });
  if (!existing || existing.assistantMessage?.id !== assistantMessageId) {
    return undefined;
  }

  const assistant = existing.assistantMessage;
  const messageMetrics = assistant.metrics;
  return {
    messageId: assistant.id,
    text: textFromMessageParts(assistant.parts),
    metrics: {
      model: assistant.model ?? messageMetrics?.model ?? "persisted",
      provider: messageMetrics?.provider,
      inputTokens: assistant.inputTokens ?? messageMetrics?.inputTokens ?? 0,
      outputTokens: assistant.outputTokens ?? messageMetrics?.outputTokens ?? 0,
      reasoningTokens:
        assistant.reasoningTokens ?? messageMetrics?.reasoningTokens ?? null,
      toolCalls: assistant.toolCalls as AIMetrics["toolCalls"] | null,
      toolCallCount: messageMetrics?.toolCallCount ?? undefined,
      toolResultChars: messageMetrics?.toolResultChars ?? undefined,
      toolTiming: messageMetrics?.toolTiming as
        | AIMetrics["toolTiming"]
        | undefined,
      ragUsed: assistant.ragUsed ?? messageMetrics?.ragUsed ?? false,
      ragChunksCount:
        assistant.ragChunksCount ?? messageMetrics?.ragChunksCount ?? 0,
      costUsd: assistant.costUsd ?? messageMetrics?.costUsd ?? 0,
      generationTimeMs:
        assistant.generationTimeMs ?? messageMetrics?.generationTimeMs ?? 0,
      reasoningTimeMs:
        assistant.reasoningTimeMs ?? messageMetrics?.reasoningTimeMs ?? null,
    },
  };
}

/**
 * Reserve one user-facing generation. Token and cost capacity reserve the
 * entire remaining daily budget, intentionally serializing finite-plan turns
 * so concurrent requests cannot both spend the same allowance.
 */
export async function reserveAiUsage({
  userId,
  requestKey,
  limits,
}: {
  userId: string;
  requestKey: string;
  limits: RateLimits;
}): Promise<AiUsageReservationResult> {
  const now = new Date();
  const today = getUTCDateOnly(now);

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const decision = await decideAndReserveAiUsage(tx, {
      userId,
      requestKey,
      today,
      now,
      expiresAt: new Date(now.getTime() + AI_RESERVATION_LEASE_MS),
      limits,
      reservationId: randomUUID(),
      claimToken: randomUUID(),
    });

    switch (decision.outcome) {
      case "in_progress":
        return {
          allowed: false,
          reason: "Generation already in progress",
          retryable: true,
        };
      case "request_limit":
        return {
          allowed: false,
          reason: "Daily request limit reached",
          retryable: false,
        };
      case "input_limit":
        return {
          allowed: false,
          reason: "Daily input token limit reached",
          retryable: false,
        };
      case "output_limit":
        return {
          allowed: false,
          reason: "Daily output token limit reached",
          retryable: false,
        };
      case "cost_limit":
        return {
          allowed: false,
          reason: "Daily spending limit reached",
          retryable: false,
        };
      case "recovered": {
        if (!decision.reservationId || !decision.claimToken) {
          throw new Error("Recovered usage reservation is missing identity");
        }
        const recovery = parseRecovery(
          decision.recoveryText,
          decision.recoveryMetrics,
        );
        if (recovery) {
          return {
            allowed: true,
            reservationId: decision.reservationId,
            claimToken: decision.claimToken,
            recovery,
          };
        }
        if (decision.assistantMessageId) {
          const persistedAssistant = await loadPersistedAssistant(
            tx,
            decision.reservationId,
            decision.assistantMessageId,
          );
          if (persistedAssistant) {
            return {
              allowed: true,
              reservationId: decision.reservationId,
              claimToken: decision.claimToken,
              persistedAssistant,
            };
          }
        }
        return {
          allowed: false,
          reason: "Generation already accounted for",
          retryable: false,
        };
      }
      case "reconciled": {
        if (!decision.reservationId || !decision.claimToken) {
          throw new Error("Reconciled usage reservation is missing identity");
        }
        if (decision.assistantMessageId) {
          const persistedAssistant = await loadPersistedAssistant(
            tx,
            decision.reservationId,
            decision.assistantMessageId,
          );
          if (persistedAssistant) {
            return {
              allowed: true,
              reservationId: decision.reservationId,
              claimToken: decision.claimToken,
              persistedAssistant,
            };
          }
        }
        return {
          allowed: false,
          reason: "Generation already accounted for",
          retryable: false,
        };
      }
      case "accounted":
        return {
          allowed: false,
          reason: "Generation already accounted for",
          retryable: false,
        };
      case "reserved":
        if (!decision.reservationId || !decision.claimToken) {
          throw new Error("Reserved usage reservation is missing identity");
        }
        return {
          allowed: true,
          reservationId: decision.reservationId,
          claimToken: decision.claimToken,
        };
    }
  });
}

function buildUsageUpdate(metrics: AIMetrics) {
  return {
    requestCount: { increment: 1 },
    inputTokens: { increment: metrics.inputTokens },
    outputTokens: { increment: metrics.outputTokens },
    reasoningTokens: { increment: metrics.reasoningTokens ?? 0 },
    totalCostUsd: { increment: metrics.costUsd },
  };
}

function buildUsageCreate(userId: string, date: Date, metrics: AIMetrics) {
  return {
    userId,
    date,
    requestCount: 1,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens ?? 0,
    totalCostUsd: metrics.costUsd,
  };
}

export async function reconcileAiUsageInTransaction(
  tx: TransactionClient,
  {
    reservationId,
    claimToken,
    userId,
    metrics,
    assistantMessageId,
    allowAlreadyReconciled = false,
  }: {
    reservationId: string;
    claimToken: string;
    userId: string;
    metrics: AIMetrics;
    assistantMessageId?: string;
    allowAlreadyReconciled?: boolean;
  },
) {
  await lockUser(tx, userId);
  const reservation = await tx.aiUsageReservation.findUnique({
    where: { id: reservationId },
  });
  if (
    !reservation ||
    reservation.userId !== userId ||
    reservation.claimToken !== claimToken
  ) {
    throw new Error("Usage reservation not found");
  }

  if (reservation.status === "RECONCILED" && allowAlreadyReconciled) {
    if (assistantMessageId) {
      await tx.aiUsageReservation.update({
        where: { id: reservationId },
        data: {
          assistantMessageId,
          recoveryText: null,
          recoveryMetrics: Prisma.DbNull,
          recoveryExpiresAt: null,
        },
      });
    }
    return { charged: false };
  }
  if (reservation.status !== "RESERVED") {
    throw new Error(`Usage reservation is ${reservation.status.toLowerCase()}`);
  }

  await tx.dailyUsage.upsert({
    where: {
      userId_date: { userId, date: reservation.date },
    },
    create: buildUsageCreate(userId, reservation.date, metrics),
    update: buildUsageUpdate(metrics),
  });
  await tx.aiUsageReservation.update({
    where: { id: reservationId },
    data: {
      status: "RECONCILED",
      actualInputTokens: metrics.inputTokens,
      actualOutputTokens: metrics.outputTokens,
      actualReasoningTokens: metrics.reasoningTokens ?? 0,
      actualCostUsd: metrics.costUsd,
      ...(assistantMessageId ? { assistantMessageId } : {}),
      recoveryText: null,
      recoveryMetrics: Prisma.DbNull,
      recoveryExpiresAt: null,
      reconciledAt: new Date(),
    },
  });
  return { charged: true };
}

function recoverableMetrics(
  metrics: AIMetrics,
  capabilityPlannerMode?: "legacy" | "agentic",
  capabilityDecision?: CapabilityDecision,
  memoryRecallDecision?: MemoryRecallDecision,
): Prisma.InputJsonValue {
  const capabilityPlanner = capabilityPlannerMode
    ? {
        mode: capabilityPlannerMode,
        ...(capabilityPlannerMode === "agentic" && capabilityDecision
          ? {
              decision: {
                rag: capabilityDecision.rag,
                webSearch: capabilityDecision.webSearch,
                webFetch: capabilityDecision.webFetch,
                memoryRead: capabilityDecision.memoryRead,
                memoryWrite: capabilityDecision.memoryWrite,
                memoryDelete: capabilityDecision.memoryDelete,
                routineProposal: capabilityDecision.routineProposal,
                userContext: capabilityDecision.userContext,
                voiceOutput: capabilityDecision.voiceOutput,
                source: capabilityDecision.source,
                reasonCodes: capabilityDecision.reasonCodes,
              },
            }
          : {}),
      }
    : undefined;
  const executionRoute = metrics.executionRoute
    ? parseExecutionRouteTrace(metrics.executionRoute)
    : null;
  const minimal = {
    model: metrics.model,
    provider: metrics.provider,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens,
    toolCalls: null,
    toolCallCount: metrics.toolCallCount,
    toolResultChars: metrics.toolResultChars,
    ragAttempted: metrics.ragAttempted,
    ragUsed: metrics.ragUsed,
    ragChunksCount: metrics.ragChunksCount,
    capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
      metrics.capabilitiesUsed,
    ),
    costUsd: metrics.costUsd,
    generationTimeMs: metrics.generationTimeMs,
    reasoningTimeMs: metrics.reasoningTimeMs,
    ...(executionRoute ? { executionRoute } : {}),
    ...(capabilityPlanner ? { capabilityPlanner } : {}),
    ...(metrics.memoryRecall && memoryRecallDecision
      ? {
          memoryRecall: {
            ...metrics.memoryRecall,
            mode: memoryRecallDecision.mode,
            reason: memoryRecallDecision.reason,
          },
        }
      : {}),
  };
  const serialized = JSON.stringify(minimal);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RECOVERY_METRICS_BYTES) {
    throw new Error("Recovery metrics exceed the persistence limit");
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

/** Charge provider work exactly once and retain enough data for a retry to
 * persist the generated answer without invoking the provider again. */
export async function reconcileAiUsageForRecovery({
  reservationId,
  claimToken,
  userId,
  text,
  metrics,
  capabilityPlannerMode,
  capabilityDecision,
  memoryRecallDecision,
}: {
  reservationId: string;
  claimToken: string;
  userId: string;
  text: string;
  metrics: AIMetrics;
  capabilityPlannerMode?: "legacy" | "agentic";
  capabilityDecision?: CapabilityDecision;
  memoryRecallDecision?: MemoryRecallDecision;
}) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const reservation = await tx.aiUsageReservation.findUnique({
      where: { id: reservationId },
    });
    if (
      !reservation ||
      reservation.userId !== userId ||
      reservation.claimToken !== claimToken
    ) {
      throw new Error("Usage reservation not found");
    }
    if (reservation.status === "RECONCILED") {
      return { charged: false };
    }
    if (reservation.status !== "RESERVED") {
      throw new Error(
        `Usage reservation is ${reservation.status.toLowerCase()}`,
      );
    }

    await tx.dailyUsage.upsert({
      where: {
        userId_date: { userId, date: reservation.date },
      },
      create: buildUsageCreate(userId, reservation.date, metrics),
      update: buildUsageUpdate(metrics),
    });
    await tx.aiUsageReservation.update({
      where: { id: reservationId },
      data: {
        status: "RECONCILED",
        actualInputTokens: metrics.inputTokens,
        actualOutputTokens: metrics.outputTokens,
        actualReasoningTokens: metrics.reasoningTokens ?? 0,
        actualCostUsd: metrics.costUsd,
        recoveryText: text.slice(0, MAX_RECOVERY_TEXT_CHARS),
        recoveryMetrics: recoverableMetrics(
          metrics,
          capabilityPlannerMode,
          capabilityDecision,
          memoryRecallDecision,
        ),
        recoveryExpiresAt: new Date(Date.now() + RECOVERY_RETENTION_MS),
        reconciledAt: new Date(),
      },
    });
    return { charged: true };
  });
}

export async function releaseAiUsageReservation({
  reservationId,
  claimToken,
  userId,
}: {
  reservationId: string;
  claimToken: string;
  userId: string;
}) {
  const result = await prisma.aiUsageReservation.updateMany({
    where: {
      id: reservationId,
      userId,
      claimToken,
      status: "RESERVED",
    },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  return result.count === 1;
}
