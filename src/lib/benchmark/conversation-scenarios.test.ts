import { describe, expect, it } from "vitest";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "./conversation-scenarios";

describe("benchmark/conversation-scenarios", () => {
  it("covers the ten conversational failure families", () => {
    expect(CONVERSATIONAL_REALITY_SCENARIOS).toHaveLength(10);
    const tags = new Set(
      CONVERSATIONAL_REALITY_SCENARIOS.flatMap((scenario) => scenario.tags),
    );
    expect(tags).toEqual(
      new Set([
        "context-continuity",
        "discovery",
        "multi-turn-progression",
        "naturalness",
        "question-quality",
      ]),
    );
  });

  it("gives every synthetic turn anchors and expectations", () => {
    for (const scenario of CONVERSATIONAL_REALITY_SCENARIOS) {
      expect(scenario.id).toMatch(/^conversation-/);
      expect(scenario.turns.length).toBeGreaterThanOrEqual(2);
      for (const turn of scenario.turns) {
        expect(turn.lowAnchorResponse?.trim()).toBeTruthy();
        expect(turn.highAnchorResponse?.trim()).toBeTruthy();
        expect(turn.judgeRubric?.trim()).toBeTruthy();
        expect(turn.conversationalExpectations).toBeDefined();
      }
    }
  });

  it("contains no obvious production identifiers", () => {
    const serialized = JSON.stringify(CONVERSATIONAL_REALITY_SCENARIOS);
    expect(serialized).not.toMatch(/@|clerk_|user_/i);
  });
});
