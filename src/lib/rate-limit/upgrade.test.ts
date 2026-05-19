import { describe, expect, it } from "vitest";
import { getUpgradeInfo } from "./upgrade";

describe("rate-limit/upgrade", () => {
  it("returns null for PRO and admin plans", () => {
    expect(getUpgradeInfo("PRO", "general")).toBeNull();
    expect(getUpgradeInfo("ADMIN", "general")).toBeNull();
  });

  it("suggests Basic for guest and trial", () => {
    expect(getUpgradeInfo("GUEST", "general")).toMatchObject({
      currentPlan: "Ospite",
      suggestedPlan: "Basic",
      upgradeUrl: "/pricing",
      primaryCta: {
        label: "Registrati ora",
        url: "/sign-up",
        intent: "signup",
      },
      secondaryCta: {
        label: "Controlla utilizzo",
        url: "/chat/usage",
      },
    });

    expect(getUpgradeInfo("TRIAL", "general")).toMatchObject({
      currentPlan: "Prova",
      suggestedPlan: "Basic",
      upgradeUrl: "/pricing",
      primaryCta: {
        label: "Passa a Basic",
        url: "/pricing",
        intent: "upgrade",
      },
    });
  });

  it("suggests Basic Plus for Basic users", () => {
    expect(getUpgradeInfo("BASIC", "general")).toMatchObject({
      currentPlan: "Basic",
      suggestedPlan: "Basic Plus",
    });
  });

  it("suggests Pro for Basic Plus users", () => {
    expect(getUpgradeInfo("BASIC_PLUS", "general")).toMatchObject({
      currentPlan: "Basic Plus",
      suggestedPlan: "Pro",
    });
  });

  it("returns contextual CTA messages by limit type", () => {
    const requestInfo = getUpgradeInfo("BASIC", "requests");
    const tokenInfo = getUpgradeInfo("BASIC", "tokens");
    const costInfo = getUpgradeInfo("BASIC", "cost");
    const generalInfo = getUpgradeInfo("BASIC", "general");

    expect(requestInfo?.ctaMessage).toContain(
      "limite giornaliero di richieste",
    );
    expect(requestInfo?.headline).toContain("richieste");
    expect(requestInfo?.limitType).toBe("requests");

    expect(tokenInfo?.ctaMessage).toContain("token");
    expect(tokenInfo?.headline).toContain("token");
    expect(tokenInfo?.limitType).toBe("tokens");

    expect(costInfo?.ctaMessage).toContain("limite di spesa giornaliero");
    expect(costInfo?.headline).toContain("budget");
    expect(costInfo?.limitType).toBe("cost");

    expect(generalInfo?.ctaMessage).toContain("raggiunto un limite");
    expect(generalInfo?.headline).toContain("piano");
    expect(generalInfo?.limitType).toBe("general");
  });
});
