/**
 * Rate Limit Module — upgrade CTA configuration.
 */

import type { CanonicalPlan } from "@/lib/plans";
import type { UpgradeInfo } from "./types";

const PLAN_HIERARCHY: CanonicalPlan[] = [
  "GUEST",
  "TRIAL",
  "BASIC",
  "BASIC_PLUS",
  "PRO",
  "ADMIN",
];

const PLAN_DISPLAY_NAMES: Record<CanonicalPlan, string> = {
  GUEST: "Ospite",
  TRIAL: "Prova",
  BASIC: "Basic",
  BASIC_PLUS: "Basic Plus",
  PRO: "Pro",
  ADMIN: "Admin",
};

/**
 * Get upgrade information based on current plan and which limit was hit.
 * Returns null for PRO/ADMIN plans (no upgrade available).
 */
export function getUpgradeInfo(
  currentPlan: CanonicalPlan,
  limitType: "requests" | "tokens" | "cost" | "general",
): UpgradeInfo | null {
  if (currentPlan === "PRO" || currentPlan === "ADMIN") {
    return null;
  }

  const nextPlanByCurrent: Partial<Record<CanonicalPlan, CanonicalPlan>> = {
    GUEST: "BASIC",
    TRIAL: "BASIC",
    BASIC: "BASIC_PLUS",
    BASIC_PLUS: "PRO",
  };

  const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan);
  if (currentIndex === -1) {
    return null;
  }

  const nextPlan = nextPlanByCurrent[currentPlan];

  if (!nextPlan) {
    return null;
  }

  const currentLabel = PLAN_DISPLAY_NAMES[currentPlan];
  const nextLabel = PLAN_DISPLAY_NAMES[nextPlan];

  let ctaMessage = "";
  let headline = "Limite raggiunto";

  switch (limitType) {
    case "requests":
      headline = "Limite richieste raggiunto";
      ctaMessage = `Hai raggiunto il limite giornaliero di richieste per il piano ${currentLabel}. Passa a ${nextLabel} per continuare a utilizzare Anthon senza interruzioni.`;
      break;
    case "tokens":
      headline = "Limite token raggiunto";
      ctaMessage = `Hai esaurito i token disponibili per oggi con il piano ${currentLabel}. Aggiorna a ${nextLabel} per ottenere più token giornalieri.`;
      break;
    case "cost":
      headline = "Limite budget giornaliero raggiunto";
      ctaMessage = `Hai raggiunto il limite di spesa giornaliero del piano ${currentLabel}. Passa a ${nextLabel} per aumentare il tuo budget giornaliero.`;
      break;
    default:
      headline = "Limite del piano raggiunto";
      ctaMessage = `Hai raggiunto un limite del tuo piano ${currentLabel}. Aggiorna a ${nextLabel} per sbloccare funzionalità aggiuntive e limiti più elevati.`;
  }

  const isGuest = currentPlan === "GUEST";
  const primaryCta = isGuest
    ? {
        label: "Registrati ora",
        url: "/sign-up",
        intent: "signup" as const,
      }
    : {
        label: `Passa a ${nextLabel}`,
        url: "/pricing",
        intent: "upgrade" as const,
      };

  return {
    currentPlan: currentLabel,
    suggestedPlan: nextLabel,
    upgradeUrl: "/pricing",
    ctaMessage,
    limitType,
    headline,
    primaryCta,
    secondaryCta: {
      label: "Controlla utilizzo",
      url: "/chat/usage",
    },
  };
}
