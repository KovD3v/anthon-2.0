import type { ServerTraceSpanV1 } from "./contracts";

export interface ModelBarSegment {
  startOffsetMs: number;
  durationMs: number;
}

const MODEL_SPAN_NAMES = new Set([
  "provider_wait",
  "reasoning",
  "model_stream",
]);

function isSameModelAttempt(left: ServerTraceSpanV1, right: ServerTraceSpanV1) {
  if (right.name !== "provider_wait") return false;

  const leftAttempt = left.attributes?.attemptSequence;
  const rightAttempt = right.attributes?.attemptSequence;
  if (leftAttempt !== undefined || rightAttempt !== undefined) {
    return leftAttempt !== undefined && leftAttempt === rightAttempt;
  }

  return left.startOffsetMs === right.startOffsetMs;
}

function subtractIntervals(
  startOffsetMs: number,
  durationMs: number,
  excludedSpans: readonly ServerTraceSpanV1[],
): ModelBarSegment[] {
  const endOffsetMs = startOffsetMs + durationMs;
  let cursor = startOffsetMs;
  const segments: ModelBarSegment[] = [];

  for (const excluded of excludedSpans) {
    const excludedStart = Math.max(startOffsetMs, excluded.startOffsetMs);
    const excludedEnd = Math.min(
      endOffsetMs,
      excluded.startOffsetMs + excluded.durationMs,
    );
    if (excludedEnd <= excludedStart) continue;

    if (excludedStart > cursor) {
      segments.push({
        startOffsetMs: cursor,
        durationMs: excludedStart - cursor,
      });
    }
    cursor = Math.max(cursor, excludedEnd);
  }

  if (cursor < endOffsetMs) {
    segments.push({
      startOffsetMs: cursor,
      durationMs: endOffsetMs - cursor,
    });
  }

  return segments;
}

export function deriveModelBarSegments(
  spans: readonly ServerTraceSpanV1[],
): Map<number, ModelBarSegment[]> {
  const modelSpans = spans.filter((span) => MODEL_SPAN_NAMES.has(span.name));
  const reasoningSpans = modelSpans.filter((span) => span.name === "reasoning");
  const segmentsById = new Map<number, ModelBarSegment[]>();

  for (const span of modelSpans) {
    if (span.name !== "provider_wait") {
      segmentsById.set(span.id, [
        {
          startOffsetMs: span.startOffsetMs,
          durationMs: span.durationMs,
        },
      ]);
      continue;
    }

    const excludedReasoning = reasoningSpans
      .filter((reasoning) => isSameModelAttempt(reasoning, span))
      .sort((left, right) => left.startOffsetMs - right.startOffsetMs);
    segmentsById.set(
      span.id,
      subtractIntervals(span.startOffsetMs, span.durationMs, excludedReasoning),
    );
  }

  return segmentsById;
}
