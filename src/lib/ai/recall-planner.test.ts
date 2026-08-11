import { describe, expect, it } from "vitest";
import { planRecall } from "./recall-planner";

const active = Object.freeze({ mode: "active" as const, reason: "configured" });

describe("recall planner", () => {
  it("enables bounded facts for an authenticated coaching turn", () => {
    const plan = planRecall({ message: "Come preparo mentalmente la gara?", decision: active, isGuest: false });
    expect(plan.facts).toEqual({ enabled: true, limit: 8, deadlineMs: 100 });
    expect(plan.conversations.enabled).toBe(false);
  });

  it("enables cross-channel eligible recall for explicit history", () => {
    const plan = planRecall({ message: "Ne avevamo parlato: cosa aveva funzionato?", decision: active, isGuest: false });
    expect(plan.conversations).toMatchObject({ enabled: true, initialScope: "current_thread", allowCrossChannel: true, limit: 4 });
  });

  it.each([
    ["ciao", active],
    ["ricordi?", Object.freeze({ mode: "off" as const, reason: "configured" })],
  ])("keeps atomic or off turns out of prompt recall", (message, decision) => {
    const plan = planRecall({ message, decision, isGuest: false });
    expect(plan.facts.enabled).toBe(false);
    expect(plan.conversations.enabled).toBe(false);
  });
});
