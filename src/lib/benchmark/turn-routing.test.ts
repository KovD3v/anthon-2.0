import { describe, expect, it } from "vitest";
import {
  scoreTurnRouting,
  shouldFailTurnRoutingEvaluation,
  TURN_ROUTING_FIXTURES,
  type TurnRoutingResult,
} from "./turn-routing";

function expectedResults(): TurnRoutingResult[] {
  return TURN_ROUTING_FIXTURES.map((fixture) => ({
    fixture,
    outcome: "accepted",
    actualProfile: fixture.expectedProfile,
    actualTaskKind: fixture.expectedTaskKind,
  }));
}

describe("turn routing benchmark", () => {
  it("covers exactly 36 bilingual expected routing outcomes", () => {
    expect(TURN_ROUTING_FIXTURES).toHaveLength(36);
    expect(
      TURN_ROUTING_FIXTURES.filter(({ language }) => language === "it"),
    ).toHaveLength(18);
    expect(
      TURN_ROUTING_FIXTURES.filter(({ language }) => language === "en"),
    ).toHaveLength(18);
    expect(
      TURN_ROUTING_FIXTURES.filter(
        ({ protectedStandard }) => protectedStandard,
      ),
    ).toHaveLength(24);
  });

  it("includes independent protected fixtures for both token-limit vetoes", () => {
    expect(
      TURN_ROUTING_FIXTURES.some(
        (fixture) =>
          ("normalization" in fixture
            ? "estimatedInputTokens" in fixture.normalization
              ? fixture.normalization.estimatedInputTokens
              : 0
            : 0) > 8_000,
      ),
    ).toBe(true);
    expect(
      TURN_ROUTING_FIXTURES.some(
        (fixture) =>
          ("normalization" in fixture
            ? "requestedOutputTokens" in fixture.normalization
              ? fixture.normalization.requestedOutputTokens
              : 0
            : 0) > 600,
      ),
    ).toBe(true);
  });

  it.each(["failed", "invalid"] as const)(
    "allows one conservative %s fallback when the other 35 classifications are valid",
    (outcome) => {
      const results = expectedResults();
      results[0] = { ...results[0], outcome };

      expect(shouldFailTurnRoutingEvaluation(results)).toBe(false);
    },
  );

  it("fails the live gate below 35 valid classifications", () => {
    const results = expectedResults();
    results[0] = { ...results[0], outcome: "failed" };
    results[1] = { ...results[1], outcome: "invalid" };

    expect(shouldFailTurnRoutingEvaluation(results)).toBe(true);
    expect(scoreTurnRouting(results).passed).toBe(false);
  });

  it("scores a complete expected run with no route or task-kind errors", () => {
    expect(scoreTurnRouting(expectedResults())).toMatchObject({
      total: 36,
      correct: 36,
      falseLight: 0,
      falseStandard: 0,
      taskKindCorrect: 36,
      passed: true,
    });
  });

  it("fails the evaluation for any protected standard fixture accepted as light", () => {
    const results = expectedResults();
    const protectedResult = results.find(
      ({ fixture }) => fixture.protectedStandard,
    );
    if (!protectedResult) throw new Error("missing protected fixture");

    protectedResult.actualProfile = "light";

    expect(scoreTurnRouting(results)).toMatchObject({
      total: 36,
      correct: 35,
      falseLight: 1,
      falseStandard: 0,
      taskKindCorrect: 36,
      protectedFalseLight: 1,
      passed: false,
    });
  });
});
