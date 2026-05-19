import type { UpgradeInfo } from "@/lib/rate-limit/types";

export interface PaywallCta {
  label: string;
  href: string;
}

export interface PaywallCardContent {
  title: string;
  message: string;
  primaryCta: PaywallCta;
  secondaryCta?: PaywallCta;
}

interface RateLimitErrorPayload {
  error?: string;
  upgradeInfo?: UpgradeInfo | null;
}

export function getPaywallCardContent(
  payload: RateLimitErrorPayload,
  isGuestUser: boolean,
): PaywallCardContent | null {
  if (payload.error !== "Rate limit exceeded") {
    return null;
  }

  const upgradeInfo = payload.upgradeInfo;

  if (upgradeInfo) {
    const isGuestPlan = upgradeInfo.currentPlan === "Ospite";
    const title = upgradeInfo.headline || "Limite Raggiunto";
    const message =
      upgradeInfo.ctaMessage ||
      (isGuestPlan
        ? "Hai raggiunto il limite di messaggi giornalieri per gli ospiti."
        : `Hai raggiunto il limite del piano ${upgradeInfo.currentPlan}.`);
    const primaryCta = upgradeInfo.primaryCta
      ? {
          label: upgradeInfo.primaryCta.label,
          href: upgradeInfo.primaryCta.url,
        }
      : {
          label: isGuestPlan
            ? "Registrati per continuare"
            : `Passa a ${upgradeInfo.suggestedPlan}`,
          href: isGuestPlan ? "/sign-up" : upgradeInfo.upgradeUrl || "/pricing",
        };

    return {
      title,
      message,
      primaryCta,
      secondaryCta: upgradeInfo.secondaryCta
        ? {
            label: upgradeInfo.secondaryCta.label,
            href: upgradeInfo.secondaryCta.url,
          }
        : undefined,
    };
  }

  return {
    title: "Limite Raggiunto",
    message: isGuestUser
      ? "Hai raggiunto il limite di messaggi giornalieri per gli ospiti."
      : "Hai raggiunto il limite giornaliero del tuo piano.",
    primaryCta: isGuestUser
      ? { label: "Registrati per continuare", href: "/sign-up" }
      : { label: "Vedi piani disponibili", href: "/pricing" },
  };
}
