type ExternalRateLimitUpgradeInfo = {
  currentPlan?: unknown;
  ctaMessage?: unknown;
};

const DEFAULT_RATE_LIMIT_MESSAGE =
  "Limite giornaliero raggiunto. Registrati per sbloccare la prova gratuita e limiti più alti.\n\nhttps://anthon.ai/sign-up";

export function formatExternalRateLimitMessage(
  upgradeInfo: ExternalRateLimitUpgradeInfo | null | undefined,
) {
  if (
    !upgradeInfo ||
    typeof upgradeInfo.ctaMessage !== "string" ||
    upgradeInfo.ctaMessage.trim().length === 0
  ) {
    return DEFAULT_RATE_LIMIT_MESSAGE;
  }

  const isGuest = upgradeInfo.currentPlan === "Ospite";
  const link = isGuest
    ? "Registrati qui: https://anthon.ai/sign-up"
    : "Vedi i piani: https://anthon.ai/pricing";

  return `${upgradeInfo.ctaMessage}\n\n${link}`;
}
