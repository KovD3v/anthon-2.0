import { describe, expect, it } from "vitest";
import {
  scoreTurnRouting,
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
        ({ normalization }) =>
          (normalization?.estimatedInputTokens ?? 0) > 8_000,
      ),
    ).toBe(true);
    expect(
      TURN_ROUTING_FIXTURES.some(
        ({ normalization }) =>
          (normalization?.requestedOutputTokens ?? 0) > 600,
      ),
    ).toBe(true);
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
