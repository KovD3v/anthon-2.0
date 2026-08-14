import { describe, expect, it } from "vitest";
import type { Usage } from "@/types/chat";
import { deriveLegacyLatencyTimeline } from "./legacy-timeline";

function usageWithRoute(
  overrides: Partial<NonNullable<Usage["executionRoute"]>> = {},
): Usage {
  return {
    inputTokens: 1,
    outputTokens: 1,
    cost: 0,
    executionRoute: {
      routingMode: "active",
      eligibleProfile: "light",
      plannedProfile: "light",
      executedProfile: "light",
      taskKind: "social",
      decisionSource: "rule",
      confidenceBucket: "high",
      reasonCodes: ["task_allowlisted"],
      classificationLatencyMs: 0,
      routingOverheadMs: 2,
      attempts: [
        {
          sequence: 1,
          profile: "light",
          outcome: "completed",
          generationTimeMs: 10,
        },
      ],
      ...overrides,
    },
  };
}

describe("deriveLegacyLatencyTimeline", () => {
  it("omits classification when deterministic routing did no live work", () => {
    const timeline = deriveLegacyLatencyTimeline(usageWithRoute());

    expect(timeline?.rows.map((row) => row.label)).toEqual([
      "Routing",
      "Generazione Light",
    ]);
  });

  it("keeps measured classifier work visible", () => {
    const timeline = deriveLegacyLatencyTimeline(
      usageWithRoute({
        decisionSource: "classifier",
        classificationLatencyMs: 18,
      }),
    );

    expect(timeline?.rows.map((row) => row.label)).toEqual([
      "Classificazione",
      "Routing",
      "Generazione Light",
    ]);
  });
});
