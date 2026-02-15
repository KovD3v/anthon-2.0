/**
 * Rate Limit Module — upgrade CTA configuration.
 */

import type { UpgradeInfo } from "./types";

// Plan hierarchy for upgrades
const PLAN_HIERARCHY = [
  "GUEST",
  "TRIAL",
  "basic",
  "basic_plus",
  "pro",
] as const;
type PlanTier = (typeof PLAN_HIERARCHY)[number];

/**
 * Get upgrade information based on current plan and which limit was hit.
 * Returns null for pro/ADMIN plans (no upgrade available).
 */
export function getUpgradeInfo(
  currentPlan: string,
  limitType: "requests" | "tokens" | "cost" | "general",
): UpgradeInfo | null {
  // Normalize plan name
  const normalizedPlan = currentPlan.toUpperCase();

  // No upgrade available for pro or admin plans
  if (
    normalizedPlan === "PRO" ||
    normalizedPlan === "ADMIN" ||
    normalizedPlan === "SUPER_ADMIN"
  ) {
    return null;
  }

  // Determine current tier and next tier
  let currentTier: PlanTier;
  let nextTier: PlanTier;

  if (normalizedPlan === "GUEST") {
    currentTier = "GUEST";
    nextTier = "basic";
  } else if (normalizedPlan === "TRIAL") {
    currentTier = "TRIAL";
    nextTier = "basic";
  } else if (normalizedPlan.includes("BASIC_PLUS")) {
    currentTier = "basic_plus";
    nextTier = "pro";
  } else if (normalizedPlan.includes("BASIC")) {
    currentTier = "basic";
    nextTier = "basic_plus";
  } else {
    // Default fallback - treat as trial
    currentTier = "TRIAL";
    nextTier = "basic";
  }

  // Get plan display names
  const planDisplayNames: Record<string, string> = {
    GUEST: "Ospite",
    TRIAL: "Prova",
    basic: "Basic",
    basic_plus: "Basic Plus",
    pro: "Pro",
  };

  // Generate contextual CTA message based on limit type
  let ctaMessage = "";
  switch (limitType) {
    case "requests":
      ctaMessage = `Hai raggiunto il limite giornaliero di richieste per il piano ${planDisplayNames[currentTier]}. Passa a ${planDisplayNames[nextTier]} per continuare a utilizzare Anthon senza interruzioni.`;
      break;
    case "tokens":
      ctaMessage = `Hai esaurito i token disponibili per oggi con il piano ${planDisplayNames[currentTier]}. Aggiorna a ${planDisplayNames[nextTier]} per ottenere più token giornalieri.`;
      break;
    case "cost":
      ctaMessage = `Hai raggiunto il limite di spesa giornaliero del piano ${planDisplayNames[currentTier]}. Passa a ${planDisplayNames[nextTier]} per aumentare il tuo budget giornaliero.`;
      break;
    default:
      ctaMessage = `Hai raggiunto un limite del tuo piano ${planDisplayNames[currentTier]}. Aggiorna a ${planDisplayNames[nextTier]} per sbloccare funzionalità aggiuntive e limiti più elevati.`;
  }

  return {
    currentPlan: planDisplayNames[currentTier],
    suggestedPlan: planDisplayNames[nextTier],
    upgradeUrl: "/pricing",
    ctaMessage,
  };
}
