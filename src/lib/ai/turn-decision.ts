import type { CapabilityDecision } from "./capability-arbitration";

/**
 * The live turn contract is intentionally capability-only. Tool authorization
 * is deterministic; the model chooses which authorized tools to call during
 * the single agentic generation.
 */
export type TurnDecision = {
  version: 1;
  capabilities: CapabilityDecision;
};

export function freezeTurnDecision(decision: TurnDecision): TurnDecision {
  if (
    Object.isFrozen(decision) &&
    Object.isFrozen(decision.capabilities) &&
    Object.isFrozen(decision.capabilities.reasonCodes)
  ) {
    return decision;
  }

  return Object.freeze({
    ...decision,
    capabilities: Object.freeze({
      ...decision.capabilities,
      reasonCodes: Object.freeze([...decision.capabilities.reasonCodes]),
    }),
  }) as TurnDecision;
}
