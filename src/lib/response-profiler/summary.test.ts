import { describe, expect, it } from "vitest";
import type { Usage } from "@/types/chat";
import { deriveResponseProfilerSummary } from "./summary";

const completeUsage: Usage = {
  inputTokens: 100,
  outputTokens: 40,
  cost: 0.01,
  generationTimeMs: 9_999,
  serverTrace: {
    version: 1,
    status: "completed",
    totalMs: 120,
    timeToFirstTokenMs: 35,
    spans: [
      {
        id: 1,
        name: "history",
        startOffsetMs: 0,
        durationMs: 100,
        status: "completed",
      },
      {
        id: 2,
        name: "user_context",
        startOffsetMs: 10,
        durationMs: 100,
        status: "completed",
      },
      {
        id: 3,
        name: "model_stream",
        startOffsetMs: 20,
        durationMs: 80,
        status: "completed",
        attributes: {
          attemptSequence: 2,
          profile: "standard",
          model: "model",
          provider: "provider",
          outcome: "completed",
        },
      },
    ],
  },
  clientTrace: {
    version: 1,
    status: "completed",
    milestones: {
      requestStartedMs: 0,
      streamOpenedMs: 10,
      firstChunkReceivedMs: 30,
      firstTextDeltaReceivedMs: 45,
      firstDomTextMs: 55,
      firstVisibleFrameMs: 70,
      streamCompletedMs: 150,
      persistedMessageResolvedMs: 180,
    },
  },
};

describe("deriveResponseProfilerSummary", () => {
  it("keeps server and browser clock domains distinct", () => {
    const summary = deriveResponseProfilerSummary(completeUsage);

    expect(summary).toMatchObject({
      quality: "complete",
      serverTotalMs: 120,
      browserTotalMs: 180,
      serverTtftMs: 35,
      firstDeltaMs: 45,
      firstVisibleMs: 70,
      perceivedCompletionMs: 150,
      persistedResolutionMs: 180,
      outsideMeasuredBackendMs: 35,
      outputTokensPerSecond: 500,
      dominantServerSpanId: 1,
    });
    expect(summary.serverTtftMs).not.toBe(completeUsage.generationTimeMs);
  });

  it("keeps overlapping spans as independent rows without inflating total time", () => {
    const summary = deriveResponseProfilerSummary(completeUsage);

    expect(summary.serverRows).toHaveLength(3);
    expect(summary.serverRows.slice(0, 2)).toEqual([
      expect.objectContaining({
        id: 1,
        startOffsetMs: 0,
        endOffsetMs: 100,
        durationMs: 100,
      }),
      expect.objectContaining({
        id: 2,
        startOffsetMs: 10,
        endOffsetMs: 110,
        durationMs: 100,
      }),
    ]);
    expect(summary.serverRows[0]?.durationPercent).toBeCloseTo(83.33, 1);
    expect(summary.serverRows[1]?.startPercent).toBeCloseTo(8.33, 1);
  });

  it("returns partial for any incomplete trace and legacy when both are absent", () => {
    expect(
      deriveResponseProfilerSummary({
        ...completeUsage,
        clientTrace: {
          version: 1,
          status: "partial",
          milestones: { requestStartedMs: 0, streamOpenedMs: 10 },
        },
      }).quality,
    ).toBe("partial");
    expect(
      deriveResponseProfilerSummary({
        inputTokens: 1,
        outputTokens: 1,
        cost: 0,
      }).quality,
    ).toBe("legacy");
  });

  it("clamps the outside-backend residual and omits invalid throughput", () => {
    const { serverTrace, clientTrace } = completeUsage;
    if (!serverTrace || !clientTrace) throw new Error("Missing trace fixture");
    const summary = deriveResponseProfilerSummary({
      ...completeUsage,
      outputTokens: 40,
      serverTrace: {
        ...serverTrace,
        timeToFirstTokenMs: 90,
        spans: serverTrace.spans.map((span) =>
          span.name === "model_stream" ? { ...span, durationMs: 0 } : span,
        ),
      },
      clientTrace: {
        ...clientTrace,
        milestones: {
          ...clientTrace.milestones,
          firstVisibleFrameMs: 70,
        },
      },
    });

    expect(summary.outsideMeasuredBackendMs).toBe(0);
    expect(summary.outputTokensPerSecond).toBeUndefined();
  });

  it("uses only closed Italian labels in timeline rows and lanes", () => {
    const summary = deriveResponseProfilerSummary(completeUsage);

    expect(summary.serverRows.map((row) => row.label)).toEqual([
      "Cronologia conversazione",
      "Profilo utente",
      "Streaming risposta",
    ]);
    expect(summary.browserLanes).toEqual([
      expect.objectContaining({
        lane: "network",
        milestones: expect.arrayContaining([
          expect.objectContaining({
            key: "Primo delta di testo",
            offsetMs: 45,
          }),
          expect.objectContaining({ key: "Stream completato", offsetMs: 150 }),
        ]),
      }),
      expect.objectContaining({
        lane: "rendering",
        milestones: expect.arrayContaining([
          expect.objectContaining({
            key: "Primo frame visibile",
            offsetMs: 70,
          }),
        ]),
      }),
      expect.objectContaining({ lane: "persistence" }),
    ]);
  });

  it("labels limit checks and atomic reservations as separate rows", () => {
    const summary = deriveResponseProfilerSummary({
      inputTokens: 1,
      outputTokens: 1,
      cost: 0,
      serverTrace: {
        version: 1,
        status: "completed",
        totalMs: 30,
        spans: [
          {
            id: 1,
            name: "rate_limit_check",
            startOffsetMs: 0,
            durationMs: 5,
            status: "completed",
          },
          {
            id: 2,
            name: "usage_reservation",
            startOffsetMs: 5,
            durationMs: 25,
            status: "completed",
          },
        ],
      },
    } as Usage);

    expect(summary.serverRows.map((row) => row.label)).toEqual([
      "Controllo limiti",
      "Prenotazione utilizzo",
    ]);
  });

  it("labels reasoning spans in the model timeline", () => {
    const summary = deriveResponseProfilerSummary({
      inputTokens: 1,
      outputTokens: 1,
      cost: 0,
      serverTrace: {
        version: 1,
        status: "completed",
        totalMs: 40,
        spans: [
          {
            id: 1,
            name: "reasoning",
            startOffsetMs: 5,
            durationMs: 20,
            status: "completed",
            attributes: {
              attemptSequence: 1,
              profile: "standard",
              model: "model",
              outcome: "completed",
            },
          },
        ],
      },
    } as Usage);

    expect(summary.serverRows).toEqual([
      expect.objectContaining({
        id: 1,
        label: "Reasoning",
        startOffsetMs: 5,
        durationMs: 20,
      }),
    ]);
  });

  it("renders legacy model spans as sequential TTFT and streaming rows", () => {
    const summary = deriveResponseProfilerSummary({
      inputTokens: 1,
      outputTokens: 30,
      cost: 0,
      serverTrace: {
        version: 1,
        status: "completed",
        totalMs: 100,
        timeToFirstTokenMs: 70,
        spans: [
          {
            id: 1,
            name: "provider_wait",
            startOffsetMs: 20,
            durationMs: 50,
            status: "completed",
            attributes: {
              attemptSequence: 1,
              profile: "standard",
              outcome: "completed",
            },
          },
          {
            id: 2,
            name: "model_stream",
            startOffsetMs: 20,
            durationMs: 80,
            status: "completed",
            attributes: {
              attemptSequence: 1,
              profile: "standard",
              outcome: "completed",
            },
          },
        ],
      },
    });

    expect(summary.serverRows).toEqual([
      expect.objectContaining({
        id: 1,
        label: "TTFT · attesa primo token",
        startOffsetMs: 20,
        endOffsetMs: 70,
        durationMs: 50,
      }),
      expect.objectContaining({
        id: 2,
        label: "Streaming risposta",
        startOffsetMs: 70,
        endOffsetMs: 100,
        durationMs: 30,
      }),
    ]);
    expect(summary.dominantServerSpanId).toBe(1);
    expect(summary.outputTokensPerSecond).toBe(1_000);
  });
});
