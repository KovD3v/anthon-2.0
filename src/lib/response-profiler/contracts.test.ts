import { describe, expect, it } from "vitest";
import {
  clientTracesEqual,
  parseClientTrace,
  parseServerTrace,
} from "./contracts";

const validServerTrace = {
  version: 1,
  status: "completed",
  totalMs: 150,
  timeToFirstTokenMs: 40,
  spans: [
    {
      id: 1,
      name: "auth",
      startOffsetMs: 0,
      durationMs: 10,
      status: "completed",
    },
    {
      id: 2,
      parentId: 1,
      name: "user_lookup",
      startOffsetMs: 2,
      durationMs: 5,
      status: "completed",
    },
    {
      id: 3,
      name: "model_stream",
      startOffsetMs: 20,
      durationMs: 120,
      status: "completed",
      attributes: {
        attemptSequence: 1,
        profile: "standard",
        model: "openai/gpt-5.6-luna",
        provider: "openrouter",
        outcome: "completed",
      },
    },
  ],
} as const;

const validClientTrace = {
  version: 1,
  status: "completed",
  milestones: {
    requestStartedMs: 0,
    streamOpenedMs: 20,
    firstChunkReceivedMs: 25,
    firstTextDeltaReceivedMs: 40,
    firstDomTextMs: 52,
    firstVisibleFrameMs: 68,
    streamCompletedMs: 60,
    persistedMessageResolvedMs: 90,
  },
} as const;

describe("response profiler contracts", () => {
  it("accepts valid server and client traces", () => {
    expect(parseServerTrace(validServerTrace)).toEqual(validServerTrace);
    expect(parseClientTrace(validClientTrace)).toEqual(validClientTrace);
  });

  it("accepts distinct limit phases while preserving legacy traces", () => {
    const trace = {
      ...validServerTrace,
      totalMs: 30,
      timeToFirstTokenMs: undefined,
      spans: [
        {
          id: 1,
          name: "rate_limit",
          startOffsetMs: 0,
          durationMs: 5,
          status: "completed",
        },
        {
          id: 2,
          name: "rate_limit_check",
          startOffsetMs: 5,
          durationMs: 5,
          status: "completed",
        },
        {
          id: 3,
          name: "usage_reservation",
          startOffsetMs: 10,
          durationMs: 20,
          status: "completed",
        },
      ],
    } as const;

    expect(parseServerTrace(trace)?.spans.map((span) => span.name)).toEqual([
      "rate_limit",
      "rate_limit_check",
      "usage_reservation",
    ]);
  });

  it("rejects unknown versions and unknown content-like keys", () => {
    expect(parseServerTrace({ ...validServerTrace, version: 2 })).toBeNull();
    expect(
      parseClientTrace({ ...validClientTrace, prompt: "SECRET" }),
    ).toBeNull();
    expect(
      parseServerTrace({
        ...validServerTrace,
        spans: [
          {
            ...validServerTrace.spans[0],
            toolArguments: "SECRET",
          },
        ],
      }),
    ).toBeNull();
  });

  it("enforces the server span count and label bounds", () => {
    expect(
      parseServerTrace({
        ...validServerTrace,
        spans: Array.from({ length: 97 }, (_, index) => ({
          id: index + 1,
          name: "tool",
          startOffsetMs: 0,
          durationMs: 1,
          status: "completed",
        })),
      }),
    ).toBeNull();

    expect(
      parseServerTrace({
        ...validServerTrace,
        spans: [
          {
            id: 1,
            name: "tool",
            startOffsetMs: 0,
            durationMs: 1,
            status: "completed",
            attributes: { toolName: "x".repeat(129) },
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects a structurally valid server trace above 32 KiB", () => {
    const label = "x".repeat(128);
    const oversized = {
      version: 1,
      status: "partial",
      totalMs: 200,
      spans: Array.from({ length: 96 }, (_, index) => ({
        id: index + 1,
        name: "tool",
        startOffsetMs: index,
        durationMs: 1,
        status: "completed",
        attributes: {
          model: label,
          provider: label,
          toolName: label,
          outcome: "completed",
        },
      })),
    };

    expect(parseServerTrace(oversized)).toBeNull();
  });

  it("rejects invalid server relationships and total bounds", () => {
    expect(
      parseServerTrace({
        ...validServerTrace,
        spans: [validServerTrace.spans[0], validServerTrace.spans[0]],
      }),
    ).toBeNull();
    expect(
      parseServerTrace({
        ...validServerTrace,
        spans: [
          {
            id: 1,
            parentId: 2,
            name: "tool",
            startOffsetMs: 0,
            durationMs: 1,
            status: "completed",
          },
          {
            id: 2,
            name: "model_stream",
            startOffsetMs: 0,
            durationMs: 2,
            status: "completed",
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseServerTrace({
        ...validServerTrace,
        totalMs: 10,
        timeToFirstTokenMs: 11,
        spans: [],
      }),
    ).toBeNull();
    expect(
      parseServerTrace({
        ...validServerTrace,
        totalMs: 10,
        timeToFirstTokenMs: 5,
        spans: [
          {
            id: 1,
            name: "auth",
            startOffsetMs: 5,
            durationMs: 6,
            status: "completed",
          },
        ],
      }),
    ).toBeNull();
  });

  it("accepts a visible frame after stream completion", () => {
    expect(parseClientTrace(validClientTrace)).not.toBeNull();
  });

  it("accepts a causally valid partial client trace", () => {
    expect(
      parseClientTrace({
        version: 1,
        status: "partial",
        milestones: {
          requestStartedMs: 0,
          streamOpenedMs: 20,
          firstChunkReceivedMs: 25,
        },
      }),
    ).not.toBeNull();
  });

  it("rejects out-of-order or causally incomplete client milestones", () => {
    expect(
      parseClientTrace({
        ...validClientTrace,
        milestones: {
          ...validClientTrace.milestones,
          firstChunkReceivedMs: 19,
        },
      }),
    ).toBeNull();
    expect(
      parseClientTrace({
        version: 1,
        status: "partial",
        milestones: {
          requestStartedMs: 0,
          firstTextDeltaReceivedMs: 30,
        },
      }),
    ).toBeNull();
    expect(
      parseClientTrace({
        version: 1,
        status: "partial",
        milestones: {
          requestStartedMs: 0,
          persistedMessageResolvedMs: 30,
        },
      }),
    ).toBeNull();
  });

  it("requires every milestone for a completed client trace", () => {
    const { firstVisibleFrameMs: _missing, ...milestones } =
      validClientTrace.milestones;

    expect(
      parseClientTrace({
        ...validClientTrace,
        milestones,
      }),
    ).toBeNull();
  });

  it("rejects non-finite, negative, non-integer, and excessive timings", () => {
    for (const streamOpenedMs of [Number.NaN, -1, 1.5, 900_001]) {
      expect(
        parseClientTrace({
          version: 1,
          status: "partial",
          milestones: { requestStartedMs: 0, streamOpenedMs },
        }),
      ).toBeNull();
    }
  });

  it("compares only normalized valid client traces", () => {
    expect(clientTracesEqual(validClientTrace, { ...validClientTrace })).toBe(
      true,
    );
    expect(
      clientTracesEqual(validClientTrace, {
        ...validClientTrace,
        milestones: {
          ...validClientTrace.milestones,
          persistedMessageResolvedMs: 91,
        },
      }),
    ).toBe(false);
    expect(clientTracesEqual(validClientTrace, { version: 2 })).toBe(false);
  });
});
