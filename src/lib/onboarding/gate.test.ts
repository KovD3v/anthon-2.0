import { describe, expect, it } from "vitest";
import {
  buildOnboardingEntry,
  onboardingRequiredResponse,
  safeOnboardingNext,
} from "./gate";

describe("onboarding gate", () => {
  it("preserves only safe product continuations", async () => {
    expect(buildOnboardingEntry("/chat/thread_1")).toBe(
      "/onboarding?next=%2Fchat%2Fthread_1",
    );
    expect(safeOnboardingNext("/profile")).toBe("/profile");
    expect(safeOnboardingNext("https://example.com")).toBe("/chat");
    expect(safeOnboardingNext("//example.com")).toBe("/chat");
    expect(safeOnboardingNext("/chat\\evil")).toBe("/chat");
  });

  it("returns a stable conflict response for APIs", async () => {
    const response = onboardingRequiredResponse("/chat/thread_1");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "ONBOARDING_REQUIRED",
      error: "Completa l'onboarding per continuare.",
      redirectTo: "/onboarding?next=%2Fchat%2Fthread_1",
    });
  });
});
