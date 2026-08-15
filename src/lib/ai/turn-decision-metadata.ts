import { z } from "zod";
import { freezeTurnDecision, type TurnDecision } from "./turn-decision";

const CAPABILITY_REASON_CODES = [
  "classifier_unavailable",
  "deterministic_policy",
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
    source: z.enum(["fallback", "rule", "classifier", "mixed"]),
    reasonCodes: z.array(z.enum(CAPABILITY_REASON_CODES)).max(32),
  })
  .strict();

const safeTurnDecisionSchema = z
  .object({
    version: z.literal(1),
    capabilities: safeCapabilityDecisionSchema,
  })
  .strict();

// Old persisted turnDecision JSON is accepted only to recover the safe
// capability subset. It is never emitted again and its execution profile is
// intentionally discarded.
const historicalTurnDecisionSchema = z
  .object({
    version: z.literal(1),
    capabilities: safeCapabilityDecisionSchema,
    execution: z.object({}).passthrough(),
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
  });
}

function toLiveTurnDecision(
  parsed: z.infer<typeof safeTurnDecisionSchema>,
): TurnDecision {
  return freezeTurnDecision({
    version: parsed.version,
    capabilities: {
      ...parsed.capabilities,
      memoryDeleteTarget: null,
    },
  });
}

export function parseSafeTurnDecision(value: unknown): TurnDecision | null {
  const parsed = safeTurnDecisionSchema.safeParse(value);
  if (parsed.success) return toLiveTurnDecision(parsed.data);

  const historical = historicalTurnDecisionSchema.safeParse(value);
  if (!historical.success) return null;
  return toLiveTurnDecision({
    version: historical.data.version,
    capabilities: historical.data.capabilities,
  });
}
