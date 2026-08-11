import type { ExecutionAttemptTrace } from "./execution-route-trace";

export type PreDeliveryEscalationReason = "provider_error" | "empty_response";

export type StreamWithPreDeliveryFallbackInput<T> = {
  primary: () => AsyncIterable<T>;
  fallback: () => AsyncIterable<T>;
  signal: AbortSignal;
  onAttempt: (attempt: ExecutionAttemptTrace) => void | Promise<void>;
  onEscalation?: (reason: PreDeliveryEscalationReason) => void | Promise<void>;
  isVisible?: (chunk: T) => boolean;
  getError?: (chunk: T) => unknown | undefined;
  isCancellation?: (chunk: T) => boolean;
  now?: () => number;
};

type AttemptResult =
  | { status: "completed" }
  | {
      status: "failed_before_stream";
      error: unknown;
      reason: PreDeliveryEscalationReason;
    };

export class ProfiledStreamEmptyResponseError extends Error {
  constructor(profile: "light" | "standard") {
    super(`${profile} execution returned an empty response`);
    this.name = "ProfiledStreamEmptyResponseError";
  }
}

function defaultVisible(chunk: unknown) {
  return typeof chunk === "string" && chunk.length > 0;
}

function cancellationReason(signal: AbortSignal) {
  return (
    signal.reason ?? new DOMException("The request was cancelled", "AbortError")
  );
}

async function* runAttempt<T>({
  factory,
  profile,
  sequence,
  signal,
  onAttempt,
  isVisible,
  getError,
  isCancellation,
  now,
}: {
  factory: () => AsyncIterable<T>;
  profile: "light" | "standard";
  sequence: 1 | 2;
  signal: AbortSignal;
  onAttempt: StreamWithPreDeliveryFallbackInput<T>["onAttempt"];
  isVisible: (chunk: T) => boolean;
  getError?: (chunk: T) => unknown | undefined;
  isCancellation?: (chunk: T) => boolean;
  now: () => number;
}): AsyncGenerator<T, AttemptResult> {
  const startedAt = now();
  const buffered: T[] = [];
  let visible = false;
  let timeToFirstTokenMs: number | undefined;

  try {
    signal.throwIfAborted();
    for await (const chunk of factory()) {
      signal.throwIfAborted();
      if (isCancellation?.(chunk)) {
        throw cancellationReason(signal);
      }
      const chunkError = getError?.(chunk);
      if (chunkError !== undefined) throw chunkError;

      if (!visible && isVisible(chunk)) {
        visible = true;
        timeToFirstTokenMs = Math.max(0, now() - startedAt);
        for (const pending of buffered) yield pending;
        buffered.length = 0;
        yield chunk;
      } else if (visible) {
        yield chunk;
      } else {
        buffered.push(chunk);
      }
    }
    signal.throwIfAborted();

    if (!visible) {
      const error = new ProfiledStreamEmptyResponseError(profile);
      await onAttempt({
        sequence,
        profile,
        outcome: "failed_before_stream",
        generationTimeMs: Math.max(0, now() - startedAt),
      });
      return {
        status: "failed_before_stream",
        error,
        reason: "empty_response",
      };
    }

    await onAttempt({
      sequence,
      profile,
      outcome: "completed",
      timeToFirstTokenMs,
      generationTimeMs: Math.max(0, now() - startedAt),
    });
    return { status: "completed" };
  } catch (error) {
    const cancelled = signal.aborted || isCancellationError(error);
    await onAttempt({
      sequence,
      profile,
      outcome: cancelled
        ? "cancelled"
        : visible
          ? "failed_during_stream"
          : "failed_before_stream",
      ...(timeToFirstTokenMs !== undefined ? { timeToFirstTokenMs } : {}),
      generationTimeMs: Math.max(0, now() - startedAt),
    });
    if (cancelled || visible) throw error;
    return {
      status: "failed_before_stream",
      error,
      reason: "provider_error",
    };
  }
}

function isCancellationError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Streams one no-tool light attempt and lazily escalates to standard only when
 * the first attempt fails before any non-empty visible delta is delivered.
 */
export async function* streamWithPreDeliveryFallback<T>({
  primary,
  fallback,
  signal,
  onAttempt,
  onEscalation,
  isVisible = defaultVisible as (chunk: T) => boolean,
  getError,
  isCancellation,
  now = Date.now,
}: StreamWithPreDeliveryFallbackInput<T>): AsyncGenerator<T> {
  const primaryResult = yield* runAttempt({
    factory: primary,
    profile: "light",
    sequence: 1,
    signal,
    onAttempt,
    isVisible,
    getError,
    isCancellation,
    now,
  });
  if (primaryResult.status === "completed") return;

  signal.throwIfAborted();
  await onEscalation?.(primaryResult.reason);
  const fallbackResult = yield* runAttempt({
    factory: fallback,
    profile: "standard",
    sequence: 2,
    signal,
    onAttempt,
    isVisible,
    getError,
    isCancellation,
    now,
  });
  if (fallbackResult.status === "failed_before_stream") {
    throw fallbackResult.error;
  }
}
