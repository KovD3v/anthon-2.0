import { z } from "zod";
import type {
  ExecutionProfile,
  ExecutionReasonCode,
  RoutingMode,
} from "./execution-routing";
import type { TaskKind } from "./turn-classification";

const EXECUTION_REASON_CODES = [
  "classifier_light",
  "classifier_standard",
  "task_allowlisted",
  "task_not_allowlisted",
  "low_confidence",
  "capability_required",
  "capability_uncertain",
  "external_knowledge",
  "deep_context",
  "sensitive_content",
  "direct_media",
  "pending_approval",
  "voice_output",
  "input_limit",
  "output_limit",
  "classifier_failure",
  "legacy_mode",
  "task_rollout_disabled",
  "rollout_off",
  "rollout_shadow",
  "runtime_invariant",
] as const satisfies readonly ExecutionReasonCode[];

const TASK_KINDS = [
  "social",
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
  "coaching",
  "knowledge",
  "planning",
  "other",
] as const satisfies readonly TaskKind[];

const executionProfileSchema = z.enum(["light", "standard"]);
const routingModeSchema = z.enum(["off", "shadow", "active"]);
const nonNegativeIntegerSchema = z.number().int().nonnegative().finite();
const nonNegativeNumberSchema = z.number().nonnegative().finite();

const executionAttemptTraceSchema = z
  .object({
    sequence: z.union([z.literal(1), z.literal(2)]),
    profile: executionProfileSchema,
    outcome: z.enum([
      "completed",
      "failed_before_stream",
      "failed_during_stream",
      "cancelled",
    ]),
    timeToFirstTokenMs: nonNegativeIntegerSchema.optional(),
    generationTimeMs: nonNegativeIntegerSchema,
    inputTokens: nonNegativeIntegerSchema.optional(),
    outputTokens: nonNegativeIntegerSchema.optional(),
    reasoningTokens: nonNegativeIntegerSchema.optional(),
    costUsd: nonNegativeNumberSchema.optional(),
  })
  .strict();

const executionRouteTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    routingMode: routingModeSchema,
    policyVersion: z.literal(1),
    classifierVersion: z.literal(1),
    eligibleProfile: executionProfileSchema,
    plannedProfile: executionProfileSchema,
    executedProfile: executionProfileSchema,
    taskKind: z.enum(TASK_KINDS),
    decisionSource: z.enum(["classifier", "rule", "mixed", "fallback"]),
    confidenceBucket: z.enum(["low", "medium", "high"]),
    reasonCodes: z.array(z.enum(EXECUTION_REASON_CODES)).max(32),
    classificationLatencyMs: nonNegativeIntegerSchema,
    routingOverheadMs: nonNegativeIntegerSchema,
    totalRequestTimeToFirstTokenMs: nonNegativeIntegerSchema.optional(),
    attempts: z.array(executionAttemptTraceSchema).min(1).max(2),
    escalation: z
      .object({
        from: z.literal("light"),
        to: z.literal("standard"),
        reason: z.enum([
          "provider_error",
          "empty_response",
          "runtime_invariant",
        ]),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((trace, context) => {
    for (const [index, attempt] of trace.attempts.entries()) {
      if (attempt.sequence !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Attempt sequences must be consecutive and start at one.",
          path: ["attempts", index, "sequence"],
        });
      }
    }

    const terminalAttempt = trace.attempts.at(-1);
    if (terminalAttempt?.profile !== trace.executedProfile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The executed profile must match the terminal attempt.",
        path: ["executedProfile"],
      });
    }

    const firstAttempt = trace.attempts[0];
    const retryAttempt = trace.attempts[1];
    if (
      retryAttempt &&
      (firstAttempt?.outcome === "completed" ||
        firstAttempt?.outcome === "cancelled")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed and cancelled attempts cannot be retried.",
        path: ["attempts", 1],
      });
    }

    const isLightToStandardTransition =
      firstAttempt?.profile === "light" && retryAttempt?.profile === "standard";
    if (isLightToStandardTransition && !trace.escalation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A light-to-standard transition requires an escalation.",
        path: ["escalation"],
      });
    }

    if (!trace.escalation) return;

    if (
      trace.routingMode !== "active" ||
      trace.eligibleProfile !== "light" ||
      trace.plannedProfile !== "light" ||
      trace.attempts.length !== 2 ||
      firstAttempt?.profile !== "light" ||
      firstAttempt.outcome !== "failed_before_stream" ||
      retryAttempt?.profile !== "standard"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Escalation is limited to a failed light attempt followed by standard.",
        path: ["escalation"],
      });
    }
  });

export type ExecutionAttemptTrace = {
  sequence: 1 | 2;
  profile: ExecutionProfile;
  outcome:
    | "completed"
    | "failed_before_stream"
    | "failed_during_stream"
    | "cancelled";
  timeToFirstTokenMs?: number;
  generationTimeMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
};

export type ExecutionRouteTrace = {
  schemaVersion: 1;
  routingMode: RoutingMode;
  policyVersion: 1;
  classifierVersion: 1;
  eligibleProfile: ExecutionProfile;
  plannedProfile: ExecutionProfile;
  executedProfile: ExecutionProfile;
  taskKind: TaskKind;
  decisionSource: "classifier" | "rule" | "mixed" | "fallback";
  confidenceBucket: "low" | "medium" | "high";
  reasonCodes: ExecutionReasonCode[];
  classificationLatencyMs: number;
  routingOverheadMs: number;
  totalRequestTimeToFirstTokenMs?: number;
  attempts: ExecutionAttemptTrace[];
  escalation?: {
    from: "light";
    to: "standard";
    reason: "provider_error" | "empty_response" | "runtime_invariant";
  };
};

export type ExecutionAttemptUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
};

/** Returns only usage values supplied by one or more completed/failed attempts. */
export function sumExecutionAttemptUsage(
  attempts: readonly ExecutionAttemptTrace[],
): ExecutionAttemptUsage {
  const totals: Required<ExecutionAttemptUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
  };
  const present = {
    inputTokens: false,
    outputTokens: false,
    reasoningTokens: false,
    costUsd: false,
  };

  for (const attempt of attempts) {
    for (const key of Object.keys(totals) as (keyof ExecutionAttemptUsage)[]) {
      const value = attempt[key];
      if (value !== undefined) {
        totals[key] += value;
        present[key] = true;
      }
    }
  }

  return {
    ...(present.inputTokens ? { inputTokens: totals.inputTokens } : {}),
    ...(present.outputTokens ? { outputTokens: totals.outputTokens } : {}),
    ...(present.reasoningTokens
      ? { reasoningTokens: totals.reasoningTokens }
      : {}),
    ...(present.costUsd ? { costUsd: Number(totals.costUsd.toFixed(12)) } : {}),
  };
}

export function parseExecutionRouteTrace(
  value: unknown,
): ExecutionRouteTrace | null {
  const parsed = executionRouteTraceSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExecutionRouteTrace) : null;
}
