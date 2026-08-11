import { z } from "zod";
import {
  EXECUTION_REASON_CODES,
  freezeTurnDecision,
  type TurnDecision,
} from "./execution-routing";
import { TASK_KINDS } from "./turn-classification";

const CAPABILITY_REASON_CODES = [
  "classifier_unavailable",
  "delete_requires_exact_target",
  "delete_requires_explicit_intent",
  "guest_memory_denied",
  "memory_disabled",
  "voice_guard_denied",
  "web_rule_forbidden",
  "web_rule_required",
] as const;

const safeCapabilityDecisionSchema = z
  .object({
    rag: z.boolean(),
    webSearch: z.boolean(),
    webFetch: z.boolean(),
    memoryRead: z.boolean(),
    memoryWrite: z.boolean(),
    memoryDelete: z.boolean(),
    routineProposal: z.boolean(),
    userContext: z.boolean(),
    voiceOutput: z.boolean(),
    source: z.enum(["fallback", "classifier", "mixed"]),
    reasonCodes: z.array(z.enum(CAPABILITY_REASON_CODES)).max(32),
  })
  .strict();

const safeExecutionDecisionSchema = z
  .object({
    eligibleProfile: z.enum(["light", "standard"]),
    taskKind: z.enum(TASK_KINDS),
    contextDependency: z.enum(["none", "recent", "deep"]),
    source: z.enum(["classifier", "rule", "mixed", "fallback"]),
    confidenceBucket: z.enum(["low", "medium", "high"]),
    reasonCodes: z.array(z.enum(EXECUTION_REASON_CODES)).max(32),
    policyVersion: z.literal(1),
    classifierVersion: z.literal(1),
  })
  .strict();

const safeTurnDecisionSchema = z
  .object({
    version: z.literal(1),
    capabilities: safeCapabilityDecisionSchema,
    execution: safeExecutionDecisionSchema,
  })
  .strict();

export type SafeTurnDecisionMetadata = z.infer<typeof safeTurnDecisionSchema>;

export function serializeSafeTurnDecision(
  decision: TurnDecision,
): SafeTurnDecisionMetadata {
  return safeTurnDecisionSchema.parse({
    version: decision.version,
    capabilities: {
      rag: decision.capabilities.rag,
      webSearch: decision.capabilities.webSearch,
      webFetch: decision.capabilities.webFetch,
      memoryRead: decision.capabilities.memoryRead,
      memoryWrite: decision.capabilities.memoryWrite,
      memoryDelete: decision.capabilities.memoryDelete,
      routineProposal: decision.capabilities.routineProposal,
      userContext: decision.capabilities.userContext,
      voiceOutput: decision.capabilities.voiceOutput,
      source: decision.capabilities.source,
      reasonCodes: decision.capabilities.reasonCodes,
    },
    execution: {
      eligibleProfile: decision.execution.eligibleProfile,
      taskKind: decision.execution.taskKind,
      contextDependency: decision.execution.contextDependency,
      source: decision.execution.source,
      confidenceBucket: decision.execution.confidenceBucket,
      reasonCodes: decision.execution.reasonCodes,
      policyVersion: decision.execution.policyVersion,
      classifierVersion: decision.execution.classifierVersion,
    },
  });
}

export function parseSafeTurnDecision(value: unknown): TurnDecision | null {
  const parsed = safeTurnDecisionSchema.safeParse(value);
  if (!parsed.success) return null;

  return freezeTurnDecision({
    version: parsed.data.version,
    capabilities: {
      ...parsed.data.capabilities,
      memoryDeleteTarget: null,
    },
    execution: parsed.data.execution,
  });
}
