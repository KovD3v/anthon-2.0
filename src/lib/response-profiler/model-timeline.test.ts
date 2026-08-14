import { describe, expect, it } from "vitest";
import type { ServerTraceSpanV1 } from "./contracts";
import { deriveModelBarSegments } from "./model-timeline";

describe("deriveModelBarSegments", () => {
  it("removes reasoning intervals from the TTFT bar without changing the raw spans", () => {
    const spans: ServerTraceSpanV1[] = [
      {
        id: 1,
        name: "provider_wait",
        startOffsetMs: 3_980,
        durationMs: 2_490,
        status: "completed",
        attributes: { attemptSequence: 1 },
      },
      {
        id: 2,
        name: "reasoning",
        startOffsetMs: 5_490,
        durationMs: 974,
        status: "completed",
        attributes: { attemptSequence: 1 },
      },
      {
        id: 3,
        name: "model_stream",
        startOffsetMs: 6_470,
        durationMs: 167,
        status: "completed",
        attributes: { attemptSequence: 1 },
      },
    ];

    const segments = deriveModelBarSegments(spans);

    expect(segments.get(1)).toEqual([
      { startOffsetMs: 3_980, durationMs: 1_510 },
      { startOffsetMs: 6_464, durationMs: 6 },
    ]);
    expect(segments.get(2)).toEqual([
      { startOffsetMs: 5_490, durationMs: 974 },
    ]);
    expect(segments.get(3)).toEqual([
      { startOffsetMs: 6_470, durationMs: 167 },
    ]);
    expect(spans[0]).toMatchObject({ startOffsetMs: 3_980, durationMs: 2_490 });
  });
});
