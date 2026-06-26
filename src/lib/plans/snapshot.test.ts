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
    expect(snapshot.policies.modelRouting.orchestrator).toBe("z-ai/glm-5.2");
    expect(snapshot.policies.modelRouting.orchestratorFallbacks).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
    expect(snapshot.policies.attachmentRetentionDays).toBe(60);
    expect(snapshot.policies.voice.maxPerWindow).toBe(20);
  });

  it("uses GLM 5.2 with DeepSeek v4 Flash fallback for every runtime plan", () => {
    const plans = [
      { isGuest: true },
      { subscriptionStatus: "TRIAL" },
      { subscriptionStatus: "ACTIVE", planId: "my-basic-plan" },
      { subscriptionStatus: "ACTIVE", planId: "my-basic_plus-plan" },
      { subscriptionStatus: "ACTIVE", planId: "my-pro-plan" },
      { userRole: "ADMIN" },
    ];

    for (const input of plans) {
      const snapshot = resolvePlanSnapshot(input);

      expect(snapshot.policies.modelRouting.orchestrator).toBe("z-ai/glm-5.2");
      expect(snapshot.policies.modelRouting.orchestratorFallbacks).toEqual([
        "deepseek/deepseek-v4-flash",
      ]);
    }
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
    expect(snapshot.policies.modelRouting.orchestrator).toBe("z-ai/glm-5.2");
    expect(snapshot.policies.modelRouting.orchestratorFallbacks).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
    expect(snapshot.policies.voice.maxPerWindow).toBe(50);
  });

  it("keeps sub-agent routing independent from orchestrator fallbacks", () => {
    const snapshot = resolvePlanSnapshot({
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-basic_plus-plan",
    });

    expect(snapshot.policies.modelRouting.subAgent).toBe(
      "google/gemini-2.5-flash",
    );
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
