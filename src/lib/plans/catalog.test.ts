import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "./catalog";

describe("plan catalog progression", () => {
  it("uses cross-provider Luna fallbacks on every plan", () => {
    for (const plan of Object.values(PLAN_CATALOG)) {
      expect(plan.modelRouting.orchestrator).toBe("openai/gpt-5.6-luna");
      expect(plan.modelRouting.orchestratorFallbacks).toEqual([
        "deepseek/deepseek-v4-flash-0731",
        "google/gemini-2.5-flash-lite",
      ]);
    }
  });

  it("has Guest as its only unpaid plan", () => {
    expect(Object.keys(PLAN_CATALOG)).toEqual([
      "GUEST",
      "BASIC",
      "BASIC_PLUS",
      "PRO",
      "ADMIN",
    ]);
  });
});
