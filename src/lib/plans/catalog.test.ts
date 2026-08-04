import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "./catalog";

describe("plan catalog progression", () => {
  it("allows registered trial users 75 requests per day", () => {
    expect(PLAN_CATALOG.TRIAL.limits.maxRequestsPerDay).toBe(75);
  });

  it("never reduces enforced guest entitlements after registration", () => {
    const guest = PLAN_CATALOG.GUEST;
    const trial = PLAN_CATALOG.TRIAL;
    const comparableLimits = [
      "maxRequestsPerDay",
      "maxInputTokensPerDay",
      "maxOutputTokensPerDay",
      "maxCostPerDay",
      "maxContextMessages",
    ] as const;

    for (const field of comparableLimits) {
      expect(
        trial.limits[field],
        `TRIAL ${field} must be at least GUEST ${field}`,
      ).toBeGreaterThanOrEqual(guest.limits[field]);
    }

    expect(trial.attachmentRetentionDays).toBeGreaterThanOrEqual(
      guest.attachmentRetentionDays,
    );
    if (guest.voice.enabled) {
      expect(trial.voice.enabled).toBe(true);
    }
  });
});
