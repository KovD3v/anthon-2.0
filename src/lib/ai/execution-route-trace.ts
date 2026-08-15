import { z } from "zod";

type ExecutionProfile = "light" | "standard";
type RoutingMode = "off" | "shadow" | "active";
type TaskKind =
  | "social"
  | "rewrite"
  | "translate"
  | "format"
  | "extract"
  | "summarize_supplied"
  | "coaching"
  | "knowledge"
  | "planning"
  | "other";
type ExecutionReasonCode = (typeof EXECUTION_REASON_CODES)[number];

// Historical-only values. New turns never create this trace.
const EXECUTION_REASON_CODES = [
  "classifier_light",
  "classifier_standard",
  "rule_light",
  "rule_standard",
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
  "fast_path_disabled",
  "task_rollout_disabled",
  "rollout_off",
  "rollout_shadow",
  "runtime_invariant",
  "untrusted_supplied_text",
] as const;

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
const boundedLabelSchema = z.string().trim().min(1).max(128);

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
    // Optional for compatibility with traces emitted before live classifier
    // routing was removed.
    classificationLatencyMs: nonNegativeIntegerSchema.optional(),
    classifierModel: boundedLabelSchema.optional(),
    classifierProvider: boundedLabelSchema.optional(),
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
    const plannedStandard = trace.plannedProfile === "standard";

    if (trace.routingMode !== "active" && !plannedStandard) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Off and shadow routes must plan standard execution.",
        path: ["plannedProfile"],
      });
    }

    if (plannedStandard) {
      if (
        trace.attempts.length !== 1 ||
        firstAttempt?.profile !== "standard" ||
        trace.executedProfile !== "standard" ||
        trace.escalation
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Standard execution permits exactly one standard attempt.",
          path: ["attempts"],
        });
      }
      return;
    }

    if (
      trace.routingMode !== "active" ||
      trace.eligibleProfile !== "light" ||
      firstAttempt?.profile !== "light"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Light execution requires an active eligible-light route.",
        path: ["plannedProfile"],
      });
    }

    if (!retryAttempt) {
      if (trace.executedProfile !== "light" || trace.escalation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A single light attempt must execute light without escalation.",
          path: ["executedProfile"],
        });
      }
      return;
    }

    if (
      trace.attempts.length !== 2 ||
      firstAttempt.outcome !== "failed_before_stream" ||
      retryAttempt.profile !== "standard" ||
      trace.executedProfile !== "standard" ||
      !trace.escalation
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
  reasonCodes: readonly ExecutionReasonCode[];
  /** Present only on historical traces that performed live classification. */
  classificationLatencyMs?: number;
  classifierModel?: string;
  classifierProvider?: string;
  routingOverheadMs: number;
  totalRequestTimeToFirstTokenMs?: number;
  attempts: readonly ExecutionAttemptTrace[];
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
