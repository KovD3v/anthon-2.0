import { describe, expect, it } from "vitest";
import { onboardingAgeSchema, onboardingAnswerSchema } from "./schemas";

describe("onboarding schemas", () => {
  it.each([1, 29, 120])("accepts integer age %s", (age) => {
    expect(onboardingAgeSchema.safeParse(age).success).toBe(true);
  });

  it.each([0, 121, 19.5])("rejects invalid age %s", (age) => {
    expect(onboardingAgeSchema.safeParse(age).success).toBe(false);
  });

  it("rejects stale-shaped or oversized answers", () => {
    expect(
      onboardingAnswerSchema.safeParse({
        expectedStep: 5,
        text: "ciao",
        skip: false,
        requestId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      onboardingAnswerSchema.safeParse({
        expectedStep: 0,
        text: "x".repeat(4001),
        skip: false,
        requestId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
