import { describe, expect, it, vi } from "vitest";
import {
  ProfiledStreamEmptyResponseError,
  streamWithPreDeliveryFallback,
} from "./profiled-stream";

async function collect(stream: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

async function* successfulChunks(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

async function* failingBeforeFirstChunk(message: string) {
  if (!message) yield "";
  throw new Error(message);
}

describe("streamWithPreDeliveryFallback", () => {
  it("uses standard when light fails before the first visible delta", async () => {
    const attempts: unknown[] = [];
    const fallback = vi.fn(() => successfulChunks(["standard answer"]));

    const chunks = await collect(
      streamWithPreDeliveryFallback({
        primary: () => failingBeforeFirstChunk("light failed"),
        fallback,
        signal: new AbortController().signal,
        onAttempt: (attempt) => {
          attempts.push(attempt);
        },
      }),
    );

    expect(chunks).toEqual(["standard answer"]);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([
      expect.objectContaining({
        sequence: 1,
        profile: "light",
        outcome: "failed_before_stream",
      }),
      expect.objectContaining({
        sequence: 2,
        profile: "standard",
        outcome: "completed",
      }),
    ]);
  });

  it("discards empty light output and escalates with an empty-response reason", async () => {
    const escalationReasons: string[] = [];

    const chunks = await collect(
      streamWithPreDeliveryFallback({
        primary: () => successfulChunks(["", ""]),
        fallback: () => successfulChunks(["standard answer"]),
        signal: new AbortController().signal,
        onAttempt: () => undefined,
        onEscalation: (reason) => {
          escalationReasons.push(reason);
        },
      }),
    );

    expect(chunks).toEqual(["standard answer"]);
    expect(escalationReasons).toEqual(["empty_response"]);
  });

  it("does not escalate after a visible light delta", async () => {
    const fallback = vi.fn(() => successfulChunks(["standard answer"]));
    const attempts: unknown[] = [];

    async function* partialThenFailure() {
      yield "light answer";
      throw new Error("late failure");
    }

    const stream = streamWithPreDeliveryFallback({
      primary: partialThenFailure,
      fallback,
      signal: new AbortController().signal,
      onAttempt: (attempt) => {
        attempts.push(attempt);
      },
    });

    await expect(collect(stream)).rejects.toThrow("late failure");
    expect(fallback).not.toHaveBeenCalled();
    expect(attempts).toEqual([
      expect.objectContaining({
        profile: "light",
        outcome: "failed_during_stream",
      }),
    ]);
  });

  it("propagates cancellation without invoking standard", async () => {
    const controller = new AbortController();
    const abortReason = new DOMException("request cancelled", "AbortError");
    const fallback = vi.fn(() => successfulChunks(["standard answer"]));
    const attempts: unknown[] = [];

    async function* cancelledBeforeDelivery() {
      controller.abort(abortReason);
      yield "";
    }

    const stream = streamWithPreDeliveryFallback({
      primary: cancelledBeforeDelivery,
      fallback,
      signal: controller.signal,
      onAttempt: (attempt) => {
        attempts.push(attempt);
      },
    });

    await expect(collect(stream)).rejects.toBe(abortReason);
    expect(fallback).not.toHaveBeenCalled();
    expect(attempts).toEqual([
      expect.objectContaining({ profile: "light", outcome: "cancelled" }),
    ]);
  });

  it("fails after one empty standard fallback without a third attempt", async () => {
    const attempts: unknown[] = [];

    await expect(
      collect(
        streamWithPreDeliveryFallback({
          primary: () => successfulChunks([]),
          fallback: () => successfulChunks([]),
          signal: new AbortController().signal,
          onAttempt: (attempt) => {
            attempts.push(attempt);
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ProfiledStreamEmptyResponseError);
    expect(attempts).toHaveLength(2);
  });
});
