import { describe, expect, it } from "vitest";
import { getPaywallCardContent } from "./paywall";

describe("rate-limit/paywall", () => {
  it("maps guest paywall payload to signup CTA", () => {
    const content = getPaywallCardContent(
      {
        error: "Rate limit exceeded",
        upgradeInfo: {
          currentPlan: "Ospite",
          suggestedPlan: "Basic",
          upgradeUrl: "/pricing",
          ctaMessage: "Registrati per continuare",
          headline: "Limite richieste raggiunto",
          primaryCta: {
            label: "Registrati ora",
            url: "/sign-up",
            intent: "signup",
          },
          secondaryCta: {
            label: "Controlla utilizzo",
            url: "/chat/usage",
          },
        },
      },
      true,
    );

    expect(content).toEqual({
      title: "Limite richieste raggiunto",
      message: "Registrati per continuare",
      primaryCta: { label: "Registrati ora", href: "/sign-up" },
      secondaryCta: { label: "Controlla utilizzo", href: "/chat/usage" },
    });
  });

  it("maps user paywall payload to pricing CTA", () => {
    const content = getPaywallCardContent(
      {
        error: "Rate limit exceeded",
        upgradeInfo: {
          currentPlan: "Basic",
          suggestedPlan: "Basic Plus",
          upgradeUrl: "/pricing",
          ctaMessage: "Passa a Basic Plus",
          primaryCta: {
            label: "Passa a Basic Plus",
            url: "/pricing",
            intent: "upgrade",
          },
        },
      },
      false,
    );

    expect(content?.primaryCta).toEqual({
      label: "Passa a Basic Plus",
      href: "/pricing",
    });
  });

  it("falls back to pricing when upgrade info is missing for authenticated users", () => {
    const content = getPaywallCardContent(
      {
        error: "Rate limit exceeded",
      },
      false,
    );

    expect(content).toMatchObject({
      title: "Limite Raggiunto",
      primaryCta: {
        label: "Vedi piani disponibili",
        href: "/pricing",
      },
    });
  });
});
