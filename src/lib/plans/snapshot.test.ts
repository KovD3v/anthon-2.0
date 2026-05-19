import { describe, expect, it } from "vitest";
import { PlanResolutionError } from "./errors";
import { resolvePlanSnapshot } from "./snapshot";

describe("plans/snapshot", () => {
  it("builds a full snapshot from personal subscription", () => {
    const snapshot = resolvePlanSnapshot({
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-basic_plus-plan",
    });

    expect(snapshot.personalPlan).toBe("BASIC_PLUS");
    expect(snapshot.effective.plan).toBe("BASIC_PLUS");
    expect(snapshot.policies.modelRouting.orchestrator).toBe(
      "google/gemini-2.0-flash-001",
    );
    expect(snapshot.policies.attachmentRetentionDays).toBe(60);
    expect(snapshot.policies.voice.maxPerWindow).toBe(20);
  });

  it("derives model routing from effective model tier", () => {
    const snapshot = resolvePlanSnapshot({
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-basic-plan",
      organizationSources: [
        {
          sourceId: "org-enterprise",
          sourceLabel: "organization:Ent:ENTERPRISE",
          modelTier: "ENTERPRISE",
          limits: {
            maxRequestsPerDay: 7,
            maxInputTokensPerDay: 7000,
            maxOutputTokensPerDay: 3500,
            maxCostPerDay: 0.7,
            maxContextMessages: 7,
          },
        },
      ],
    });

    expect(snapshot.effective.modelTier).toBe("ENTERPRISE");
    expect(snapshot.policies.modelRouting.orchestrator).toBe(
      "google/gemini-2.0-flash-lite-001",
    );
    expect(snapshot.policies.voice.maxPerWindow).toBe(50);
  });

  it("fails closed for invalid active plan IDs", () => {
    expect(() =>
      resolvePlanSnapshot({
        subscriptionStatus: "ACTIVE",
        userRole: "USER",
        planId: "invalid-plan",
      }),
    ).toThrow(PlanResolutionError);
  });
});
