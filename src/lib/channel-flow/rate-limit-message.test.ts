import { describe, expect, it } from "vitest";

import { formatExternalRateLimitMessage } from "./rate-limit-message";

describe("channel-flow/rate-limit-message", () => {
  it("formats guest upgrade messages with a sign-up link", () => {
    expect(
      formatExternalRateLimitMessage({
        currentPlan: "Ospite",
        ctaMessage: "Hai raggiunto il limite guest.",
      }),
    ).toBe(
      "Hai raggiunto il limite guest.\n\nRegistrati qui: https://anthon.ai/sign-up",
    );
  });

  it("formats paid-plan upgrade messages with a pricing link", () => {
    expect(
      formatExternalRateLimitMessage({
        currentPlan: "Pro",
        ctaMessage: "Hai raggiunto il limite del piano.",
      }),
    ).toBe(
      "Hai raggiunto il limite del piano.\n\nVedi i piani: https://anthon.ai/pricing",
    );
  });

  it("uses the default guest sign-up message without upgrade info", () => {
    expect(formatExternalRateLimitMessage(null)).toBe(
      "Limite giornaliero raggiunto. Registrati per sbloccare la prova gratuita e limiti più alti.\n\nhttps://anthon.ai/sign-up",
    );
  });
});
