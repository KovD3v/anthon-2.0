import {
  MAX_SERVER_SPANS,
  MAX_TRACE_LABEL_LENGTH,
  MAX_TRACE_MS,
  parseServerTrace,
  SERVER_SPAN_NAMES,
  type ServerSpanAttributes,
  type ServerSpanName,
  type ServerTraceSpanV1,
  type ServerTraceV1,
} from "./contracts";

type ServerSpanStatus = ServerTraceSpanV1["status"];
type RequestedTraceStatus = ServerTraceV1["status"];

export interface ServerSpanHandle {
  readonly id: number;
  end(status?: ServerSpanStatus, finalAttributes?: ServerSpanAttributes): void;
  annotate(attributes: ServerSpanAttributes): void;
}

export interface ServerTraceCollector {
  startSpan(
    name: ServerSpanName,
    attributes?: ServerSpanAttributes,
    parentId?: number,
  ): ServerSpanHandle;
  measure<T>(
    name: ServerSpanName,
    operation: () => Promise<T>,
    attributes?: ServerSpanAttributes,
    parentId?: number,
  ): Promise<T>;
  markFirstToken(): void;
  markPartial(): void;
  markCancelled(): void;
  snapshot(status: RequestedTraceStatus): ServerTraceV1;
}

export type ModelAttemptTrace = {
  observeTextDelta(text: string): void;
  complete(provider?: string): void;
  empty(provider?: string): void;
  fail(provider?: string): void;
  cancel(provider?: string): void;
};

export type ToolExecutionTrace = {
  notAllowed(): void;
  complete(): void;
  fail(): void;
  cancel(): void;
};

type MutableSpan = {
  id: number;
  parentId?: number;
  name: ServerSpanName;
  startOffsetMs: number;
  durationMs?: number;
  status?: ServerSpanStatus;
  attributes?: ServerSpanAttributes;
};

const NOOP_SPAN: ServerSpanHandle = {
  id: 0,
  end() {},
  annotate() {},
};

const OUTCOMES = new Set([
  "completed",
  "failed_before_stream",
  "failed_during_stream",
  "empty_response",
  "not_allowed",
  "cancelled",
]);

function boundedMilliseconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_TRACE_MS, Math.max(0, Math.round(value)));
}

function boundedLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, MAX_TRACE_LABEL_LENGTH);
  return normalized || undefined;
}

function sanitizeAttributes(
  value: ServerSpanAttributes | undefined,
): ServerSpanAttributes | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const attemptSequence =
    source.attemptSequence === 1 || source.attemptSequence === 2
      ? source.attemptSequence
      : undefined;
  const profile =
    source.profile === "light" || source.profile === "standard"
      ? source.profile
      : undefined;
  const model = boundedLabel(source.model);
  const provider = boundedLabel(source.provider);
  const toolName = boundedLabel(source.toolName);
  const ragChunkCount =
    typeof source.ragChunkCount === "number" &&
    Number.isFinite(source.ragChunkCount) &&
    source.ragChunkCount >= 0
      ? Math.min(10_000, Math.floor(source.ragChunkCount))
      : undefined;
  const outcome = OUTCOMES.has(String(source.outcome))
    ? (source.outcome as ServerSpanAttributes["outcome"])
    : undefined;
  const sanitized: ServerSpanAttributes = {
    ...(attemptSequence !== undefined ? { attemptSequence } : {}),
    ...(profile ? { profile } : {}),
    ...(model ? { model } : {}),
    ...(provider ? { provider } : {}),
    ...(toolName ? { toolName } : {}),
    ...(ragChunkCount !== undefined ? { ragChunkCount } : {}),
    ...(outcome ? { outcome } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function mergeAttributes(
  initial: ServerSpanAttributes | undefined,
  final: ServerSpanAttributes | undefined,
): ServerSpanAttributes | undefined {
  const merged = {
    ...sanitizeAttributes(initial),
    ...sanitizeAttributes(final),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function createServerTraceCollector(
  options: { now?: () => number } = {},
): ServerTraceCollector {
  const now = options.now ?? (() => performance.now());
  let lastClock = 0;
  const readClock = () => {
    try {
      const value = now();
      if (Number.isFinite(value)) lastClock = Math.max(lastClock, value);
    } catch {
      // Profiling must never affect the request it observes.
    }
    return lastClock;
  };
  const startedAt = readClock();
  const elapsed = () => boundedMilliseconds(readClock() - startedAt);
  const spans: MutableSpan[] = [];
  let firstTokenMs: number | undefined;
  let forcedPartial = false;
  let cancelled = false;

  const startSpan: ServerTraceCollector["startSpan"] = (
    name,
    attributes,
    parentId,
  ) => {
    if (
      spans.length >= MAX_SERVER_SPANS ||
      !(SERVER_SPAN_NAMES as readonly string[]).includes(name)
    ) {
      forcedPartial = true;
      return NOOP_SPAN;
    }

    const knownParent =
      parentId !== undefined && spans.some((span) => span.id === parentId)
        ? parentId
        : undefined;
    const initialAttributes = sanitizeAttributes(attributes);
    const span: MutableSpan = {
      id: spans.length + 1,
      ...(knownParent !== undefined ? { parentId: knownParent } : {}),
      name,
      startOffsetMs: elapsed(),
      ...(initialAttributes ? { attributes: initialAttributes } : {}),
    };
    spans.push(span);
    let ended = false;

    return {
      id: span.id,
      end(status = "completed", finalAttributes) {
        if (ended || span.status !== undefined) return;
        ended = true;
        span.durationMs = boundedMilliseconds(elapsed() - span.startOffsetMs);
        span.status = status;
        span.attributes = mergeAttributes(span.attributes, finalAttributes);
      },
      annotate(finalAttributes) {
        const sanitized = sanitizeAttributes(finalAttributes);
        if (!sanitized) return;
        span.attributes = {
          ...sanitized,
          ...span.attributes,
        };
      },
    };
  };

  return {
    startSpan,
    async measure(name, operation, attributes, parentId) {
      const span = startSpan(name, attributes, parentId);
      try {
        const result = await operation();
        span.end("completed");
        return result;
      } catch (error) {
        span.end("failed");
        throw error;
      }
    },
    markFirstToken() {
      if (firstTokenMs === undefined) firstTokenMs = elapsed();
    },
    markPartial() {
      forcedPartial = true;
    },
    markCancelled() {
      cancelled = true;
      const cancelledAt = elapsed();
      for (const span of spans) {
        if (span.status !== undefined) continue;
        span.durationMs = boundedMilliseconds(cancelledAt - span.startOffsetMs);
        span.status = "cancelled";
        if (
          span.name === "provider_wait" ||
          span.name === "model_stream" ||
          span.name === "tool"
        ) {
          span.attributes = mergeAttributes(span.attributes, {
            outcome: "cancelled",
          });
        }
      }
    },
    snapshot(requestedStatus) {
      const totalMs = elapsed();
      const closedSpans = spans.filter(
        (
          span,
        ): span is MutableSpan & {
          durationMs: number;
          status: ServerSpanStatus;
        } => span.durationMs !== undefined && span.status !== undefined,
      );
      const closedIds = new Set(closedSpans.map((span) => span.id));
      let boundedSpans: ServerTraceSpanV1[] = closedSpans.map((span) => ({
        id: span.id,
        ...(span.parentId !== undefined && closedIds.has(span.parentId)
          ? { parentId: span.parentId }
          : {}),
        name: span.name,
        startOffsetMs: span.startOffsetMs,
        durationMs: span.durationMs,
        status: span.status,
        ...(span.attributes ? { attributes: { ...span.attributes } } : {}),
      }));
      const hasOpenSpans = closedSpans.length !== spans.length;
      let status: RequestedTraceStatus =
        cancelled || requestedStatus === "cancelled"
          ? "cancelled"
          : forcedPartial || hasOpenSpans || requestedStatus === "partial"
            ? "partial"
            : "completed";

      const buildTrace = (): ServerTraceV1 => ({
        version: 1,
        status,
        totalMs,
        ...(firstTokenMs !== undefined
          ? { timeToFirstTokenMs: Math.min(firstTokenMs, totalMs) }
          : {}),
        spans: boundedSpans,
      });

      let trace = buildTrace();
      while (parseServerTrace(trace) === null && boundedSpans.length > 0) {
        forcedPartial = true;
        if (!cancelled && requestedStatus !== "cancelled") status = "partial";
        boundedSpans = boundedSpans.slice(0, -1);
        trace = buildTrace();
      }

      return (
        parseServerTrace(trace) ?? {
          version: 1,
          status: cancelled ? "cancelled" : "partial",
          totalMs,
          spans: [],
        }
      );
    },
  };
}

export function startModelAttemptTrace(
  collector: ServerTraceCollector | undefined,
  attributes: Pick<
    ServerSpanAttributes,
    "attemptSequence" | "profile" | "model"
  >,
): ModelAttemptTrace {
  const providerWait =
    collector?.startSpan("provider_wait", attributes) ?? NOOP_SPAN;
  let modelStream: ServerSpanHandle | undefined;
  let sawText = false;
  let providerWaitEnded = false;
  let ended = false;

  const endProviderWait = (
    status: ServerSpanStatus,
    outcome?: ServerSpanAttributes["outcome"],
    provider?: string,
  ) => {
    if (providerWaitEnded) return;
    providerWaitEnded = true;
    providerWait.end(status, {
      ...(outcome ? { outcome } : {}),
      ...(provider ? { provider } : {}),
    });
  };

  const finish = (
    status: ServerSpanStatus,
    outcome: NonNullable<ServerSpanAttributes["outcome"]>,
    provider?: string,
  ) => {
    if (ended) return;
    ended = true;
    endProviderWait(status, outcome, provider);
    providerWait.annotate({
      outcome,
      ...(provider ? { provider } : {}),
    });
    modelStream?.end(status, {
      outcome,
      ...(provider ? { provider } : {}),
    });
  };

  return {
    observeTextDelta(text) {
      if (ended || text.length === 0) return;
      if (!sawText) {
        sawText = true;
        collector?.markFirstToken();
        endProviderWait("completed");
        modelStream = collector?.startSpan("model_stream", attributes);
      }
    },
    complete(provider) {
      finish(
        sawText ? "completed" : "failed",
        sawText ? "completed" : "empty_response",
        provider,
      );
    },
    empty(provider) {
      finish("failed", "empty_response", provider);
    },
    fail(provider) {
      finish(
        "failed",
        sawText ? "failed_during_stream" : "failed_before_stream",
        provider,
      );
    },
    cancel(provider) {
      finish("cancelled", "cancelled", provider);
    },
  };
}

export function startToolExecutionTrace(
  collector: ServerTraceCollector | undefined,
  toolName: string,
): ToolExecutionTrace {
  const span =
    collector?.startSpan("tool", {
      toolName,
    }) ?? NOOP_SPAN;
  let ended = false;
  const finish = (
    status: ServerSpanStatus,
    outcome: NonNullable<ServerSpanAttributes["outcome"]>,
  ) => {
    if (ended) return;
    ended = true;
    span.end(status, { outcome });
  };

  return {
    notAllowed() {
      finish("completed", "not_allowed");
    },
    complete() {
      finish("completed", "completed");
    },
    fail() {
      finish("failed", "failed_during_stream");
    },
    cancel() {
      finish("cancelled", "cancelled");
    },
  };
}

export function extractSelectedProvider(
  providerMetadata: Record<string, unknown> | undefined,
): string | undefined {
  const openrouter = providerMetadata?.openrouter;
  if (
    !openrouter ||
    typeof openrouter !== "object" ||
    Array.isArray(openrouter)
  ) {
    return undefined;
  }
  const metadata = openrouter as Record<string, unknown>;
  for (const key of [
    "provider",
    "providerName",
    "provider_name",
    "selectedProvider",
    "selected_provider",
  ]) {
    const value = boundedLabel(metadata[key]);
    if (value) return value;
  }
  return undefined;
}
