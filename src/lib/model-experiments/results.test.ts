import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    modelExperiment: { findUnique: mocks.findUnique },
  },
}));

import { getModelExperimentSummary } from "./results";

const control = { id: "control", role: "CONTROL" };
const candidate = { id: "candidate", role: "CANDIDATE" };

function response(
  variantId: string,
  overrides: Partial<{
    status: "COMPLETED" | "FAILED";
    outputTokens: number | null;
    costUsd: number | null;
    timeToFirstTokenMs: number | null;
    generationTimeMs: number | null;
  }> = {},
) {
  return {
    variantId,
    status: overrides.status ?? "COMPLETED",
    outputTokens:
      overrides.outputTokens === undefined ? 100 : overrides.outputTokens,
    costUsd: overrides.costUsd === undefined ? 0.1 : overrides.costUsd,
    timeToFirstTokenMs:
      overrides.timeToFirstTokenMs === undefined
        ? 100
        : overrides.timeToFirstTokenMs,
    generationTimeMs:
      overrides.generationTimeMs === undefined
        ? 1_000
        : overrides.generationTimeMs,
  };
}

describe("model experiment results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00Z"));
  });

  it("selects only summary fields and aggregates votes, reliability, latency, and cost", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "experiment-1",
      key: "italy-models",
      name: "Italy models",
      status: "COMPLETED",
      activatedAt: new Date("2026-07-20T12:00:00Z"),
      completedAt: new Date("2026-07-30T12:00:00Z"),
      createdAt: new Date("2026-07-19T12:00:00Z"),
      variants: [control, candidate],
      pairs: [
        {
          status: "RESOLVED",
          vote: "A",
          selectedVariantId: control.id,
          userId: "user-1",
          canonicalMessage: { feedback: 1 },
          responses: [
            response(control.id),
            response(candidate.id, {
              costUsd: 0.2,
              timeToFirstTokenMs: 200,
              generationTimeMs: 2_000,
            }),
          ],
        },
        {
          status: "RESOLVED",
          vote: "B",
          selectedVariantId: candidate.id,
          userId: "user-2",
          canonicalMessage: { feedback: -1 },
          responses: [
            response(control.id, {
              outputTokens: 150,
              costUsd: 0.3,
              timeToFirstTokenMs: 300,
              generationTimeMs: 3_000,
            }),
            response(candidate.id, {
              outputTokens: 200,
              costUsd: 0.4,
              timeToFirstTokenMs: 400,
              generationTimeMs: 4_000,
            }),
          ],
        },
        {
          status: "RESOLVED",
          vote: "TIE",
          selectedVariantId: control.id,
          userId: "user-1",
          canonicalMessage: { feedback: 0 },
          responses: [
            response(control.id, {
              outputTokens: null,
              costUsd: null,
              timeToFirstTokenMs: null,
              generationTimeMs: null,
            }),
            response(candidate.id, {
              status: "FAILED",
              outputTokens: null,
              costUsd: null,
              timeToFirstTokenMs: null,
              generationTimeMs: null,
            }),
          ],
        },
        {
          status: "PARTIAL_FAILED",
          vote: "AUTO_SUCCESS",
          selectedVariantId: candidate.id,
          userId: "user-3",
          canonicalMessage: null,
          responses: [
            response(control.id, {
              status: "FAILED",
              outputTokens: null,
              costUsd: null,
              timeToFirstTokenMs: null,
              generationTimeMs: null,
            }),
            response(candidate.id, {
              outputTokens: 50,
              costUsd: 0.5,
              timeToFirstTokenMs: 50,
              generationTimeMs: 500,
            }),
          ],
        },
        {
          status: "FAILED",
          vote: null,
          selectedVariantId: null,
          userId: "user-4",
          canonicalMessage: null,
          responses: [
            response(control.id, { status: "FAILED", costUsd: null }),
            response(candidate.id, { status: "FAILED", costUsd: null }),
          ],
        },
      ],
    });

    const summary = await getModelExperimentSummary("experiment-1");

    const query = mocks.findUnique.mock.calls[0]?.[0];
    expect(query.select.pairs.select.responses.select).toEqual({
      variantId: true,
      status: true,
      outputTokens: true,
      costUsd: true,
      timeToFirstTokenMs: true,
      generationTimeMs: true,
    });
    expect(query.select.pairs.select.responses).not.toHaveProperty("include");
    expect(summary).toMatchObject({
      id: "experiment-1",
      sampleSize: 3,
      participants: 2,
      daysRunning: 10,
      votes: { control: 1, candidate: 1, tie: 1 },
      decisiveCandidateShare: 0.5,
      partialFailureRate: 0.2,
      failureRate: 0.2,
      latency: {
        control: {
          firstTokenP50: 200,
          firstTokenP95: 290,
          totalP50: 2_000,
          totalP95: 2_900,
        },
        candidate: {
          firstTokenP50: 200,
          firstTokenP95: 380,
          totalP50: 2_000,
          totalP95: 3_800,
        },
      },
      cost: { control: 0.4, candidate: 1.1, overhead: 0.5 },
      outputTokensPerSecond: {
        control: 75,
        candidate: 200 / 3,
      },
      canonicalFeedback: { positive: 1, neutral: 1, negative: 1 },
      readyForManualReview: false,
    });
    expect(summary?.decisiveCandidateShare95?.[0]).toBeGreaterThan(0);
    expect(summary?.decisiveCandidateShare95?.[1]).toBeLessThan(1);
  });

  it("returns neutral metrics for an experiment without pairs", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "experiment-2",
      key: "empty",
      name: "Empty experiment",
      status: "DRAFT",
      activatedAt: null,
      completedAt: null,
      createdAt: new Date("2026-07-31T11:30:00Z"),
      variants: [control, candidate],
      pairs: [],
    });

    await expect(getModelExperimentSummary("experiment-2")).resolves.toEqual(
      expect.objectContaining({
        sampleSize: 0,
        participants: 0,
        daysRunning: 1,
        decisiveCandidateShare: null,
        decisiveCandidateShare95: null,
        partialFailureRate: 0,
        failureRate: 0,
        cost: { control: 0, candidate: 0, overhead: 0 },
        outputTokensPerSecond: { control: null, candidate: null },
      }),
    );
  });

  it("returns null for an unknown experiment", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getModelExperimentSummary("missing")).resolves.toBeNull();
  });
});
