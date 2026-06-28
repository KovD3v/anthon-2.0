import { describe, expect, it } from "vitest";
import { rankProviderRoutes } from "./provider-routing-score";

describe("provider-routing-score", () => {
  it("prefers a steadier provider over a lower p50 provider with bad tail latency", () => {
    const ranked = rankProviderRoutes(
      [
        { provider: "fast-tail-risk", e2eLatencySeconds: 4 },
        { provider: "steady", e2eLatencySeconds: 5 },
      ],
      new Map([
        [
          "fast-tail-risk",
          {
            provider: "fast-tail-risk",
            successWeight: 30,
            failureWeight: 0,
            p50LatencySeconds: 4,
            p95LatencySeconds: 18,
            sampleCount: 30,
          },
        ],
        [
          "steady",
          {
            provider: "steady",
            successWeight: 30,
            failureWeight: 0,
            p50LatencySeconds: 5,
            p95LatencySeconds: 7,
            sampleCount: 30,
          },
        ],
      ]),
      { targetP95LatencySeconds: 8 },
    );

    expect(ranked.map((route) => route.provider)).toEqual([
      "steady",
      "fast-tail-risk",
    ]);
    expect(ranked[1]?.components.tailRiskSeconds).toBeGreaterThan(0);
  });

  it("accounts for slow failed attempts plus fallback latency", () => {
    const ranked = rankProviderRoutes(
      [
        { provider: "fast-when-it-works", e2eLatencySeconds: 3 },
        { provider: "reliable", e2eLatencySeconds: 6 },
      ],
      new Map([
        [
          "fast-when-it-works",
          {
            provider: "fast-when-it-works",
            successWeight: 8,
            failureWeight: 2,
            p50LatencySeconds: 3,
            p95LatencySeconds: 5,
            avgFailedAttemptLatencySeconds: 10,
            sampleCount: 10,
          },
        ],
        [
          "reliable",
          {
            provider: "reliable",
            successWeight: 20,
            failureWeight: 0,
            p50LatencySeconds: 6,
            p95LatencySeconds: 7,
            sampleCount: 20,
          },
        ],
      ]),
      { targetP95LatencySeconds: 8 },
    );

    expect(ranked.map((route) => route.provider)).toEqual([
      "reliable",
      "fast-when-it-works",
    ]);
    expect(ranked[1]?.components.expectedFailureCostSeconds).toBeGreaterThan(6);
  });

  it("keeps unknown providers eligible with an uncertainty penalty", () => {
    const ranked = rankProviderRoutes(
      [
        { provider: "known", e2eLatencySeconds: 5 },
        { provider: "unknown", e2eLatencySeconds: 5 },
      ],
      new Map([
        [
          "known",
          {
            provider: "known",
            successWeight: 20,
            failureWeight: 0,
            p50LatencySeconds: 5,
            p95LatencySeconds: 6,
            sampleCount: 20,
          },
        ],
      ]),
      { targetP95LatencySeconds: 8 },
    );

    expect(ranked.map((route) => route.provider)).toEqual(["known", "unknown"]);
    expect(ranked[1]?.components.uncertaintyPenaltySeconds).toBeGreaterThan(
      ranked[0]?.components.uncertaintyPenaltySeconds ?? 0,
    );
  });
});
