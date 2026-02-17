import { describe, expect, it } from "vitest";
import { getUpgradeInfo } from "./upgrade";

describe("rate-limit/upgrade", () => {
  it("returns null for PRO and admin plans", () => {
    expect(getUpgradeInfo("PRO", "general")).toBeNull();
    expect(getUpgradeInfo("ADMIN", "general")).toBeNull();
    expect(getUpgradeInfo("SUPER_ADMIN", "general")).toBeNull();
  });

  it("suggests Basic for guest and trial", () => {
    expect(getUpgradeInfo("GUEST", "general")).toMatchObject({
      currentPlan: "Ospite",
      suggestedPlan: "Basic",
      upgradeUrl: "/pricing",
    });

    expect(getUpgradeInfo("TRIAL", "general")).toMatchObject({
      currentPlan: "Prova",
      suggestedPlan: "Basic",
      upgradeUrl: "/pricing",
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
    expect(getUpgradeInfo("BASIC", "requests")?.ctaMessage).toContain(
      "limite giornaliero di richieste",
    );
    expect(getUpgradeInfo("BASIC", "tokens")?.ctaMessage).toContain("token");
    expect(getUpgradeInfo("BASIC", "cost")?.ctaMessage).toContain(
      "limite di spesa giornaliero",
    );
    expect(getUpgradeInfo("BASIC", "general")?.ctaMessage).toContain(
      "raggiunto un limite",
    );
  });
});
