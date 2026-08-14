import { z } from "zod";

export const TRACE_VERSION = 1 as const;
export const MAX_TRACE_MS = 900_000;
export const MAX_SERVER_SPANS = 96;
export const MAX_TRACE_BYTES = 32 * 1024;
export const MAX_TRACE_LABEL_LENGTH = 128;

export const SERVER_SPAN_NAMES = [
  "auth",
  "database_connect",
  "user_lookup",
  "chat_lookup",
  "billing_sync",
  "rate_limit_check",
  "usage_reservation",
  // Retained so persisted v1 traces created before the split remain readable.
  "rate_limit",
  "inbound_claim",
  "attachment_resolution",
  "transcription",
  "classification",
  "routing",
  "history",
  "user_context",
  "memory_facts",
  "memory_query",
  "memory_format",
  "conversation_recall",
  "rag_decision",
  "rag_embedding",
  "rag_search",
  "prompt_build",
  "provider_wait",
  "reasoning",
  "model_stream",
  "tool",
  "assistant_persistence",
] as const;

const traceStatusSchema = z.enum(["completed", "partial", "cancelled"]);
const serverSpanStatusSchema = z.enum(["completed", "failed", "cancelled"]);
const serverSpanOutcomeSchema = z.enum([
  "completed",
  "failed_before_stream",
  "failed_during_stream",
  "empty_response",
  "not_allowed",
  "cancelled",
]);
const millisecondsSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(MAX_TRACE_MS);
const boundedLabelSchema = z.string().trim().min(1).max(MAX_TRACE_LABEL_LENGTH);

export const serverSpanAttributesSchema = z
  .object({
    attemptSequence: z.union([z.literal(1), z.literal(2)]).optional(),
    profile: z.enum(["light", "standard"]).optional(),
    model: boundedLabelSchema.optional(),
    provider: boundedLabelSchema.optional(),
    toolName: boundedLabelSchema.optional(),
    ragChunkCount: z.number().int().nonnegative().max(10_000).optional(),
    outcome: serverSpanOutcomeSchema.optional(),
  })
  .strict();

export const serverTraceSpanSchema = z
  .object({
    id: z.number().int().positive().max(MAX_SERVER_SPANS),
    parentId: z.number().int().positive().max(MAX_SERVER_SPANS).optional(),
    name: z.enum(SERVER_SPAN_NAMES),
    startOffsetMs: millisecondsSchema,
    durationMs: millisecondsSchema,
    status: serverSpanStatusSchema,
    attributes: serverSpanAttributesSchema.optional(),
  })
  .strict();

export const serverTraceSchema = z
  .object({
    version: z.literal(TRACE_VERSION),
    status: traceStatusSchema,
    totalMs: millisecondsSchema,
    timeToFirstTokenMs: millisecondsSchema.optional(),
    spans: z.array(serverTraceSpanSchema).max(MAX_SERVER_SPANS),
  })
  .strict()
  .superRefine((trace, context) => {
    if (
      trace.timeToFirstTokenMs !== undefined &&
      trace.timeToFirstTokenMs > trace.totalMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstTokenMs"],
        message: "timeToFirstTokenMs must not exceed totalMs",
      });
    }

    const seenIds = new Set<number>();
    for (const [index, span] of trace.spans.entries()) {
      if (seenIds.has(span.id)) {
        context.addIssue({
          code: "custom",
          path: ["spans", index, "id"],
          message: "span ids must be unique",
        });
      }
      if (span.parentId !== undefined && !seenIds.has(span.parentId)) {
        context.addIssue({
          code: "custom",
          path: ["spans", index, "parentId"],
          message: "parentId must reference an earlier span",
        });
      }
      if (span.startOffsetMs + span.durationMs > trace.totalMs) {
        context.addIssue({
          code: "custom",
          path: ["spans", index, "durationMs"],
          message: "span must end within totalMs",
        });
      }
      seenIds.add(span.id);
    }
  });

export const clientTraceMilestonesSchema = z
  .object({
    requestStartedMs: z.literal(0),
    streamOpenedMs: millisecondsSchema.optional(),
    firstChunkReceivedMs: millisecondsSchema.optional(),
    firstTextDeltaReceivedMs: millisecondsSchema.optional(),
    firstDomTextMs: millisecondsSchema.optional(),
    firstVisibleFrameMs: millisecondsSchema.optional(),
    streamCompletedMs: millisecondsSchema.optional(),
    persistedMessageResolvedMs: millisecondsSchema.optional(),
  })
  .strict();

const CLIENT_MILESTONE_KEYS = [
  "streamOpenedMs",
  "firstChunkReceivedMs",
  "firstTextDeltaReceivedMs",
  "firstDomTextMs",
  "firstVisibleFrameMs",
  "streamCompletedMs",
  "persistedMessageResolvedMs",
] as const;

export const clientTraceSchema = z
  .object({
    version: z.literal(TRACE_VERSION),
    status: z.enum(["completed", "partial", "abandoned"]),
    milestones: clientTraceMilestonesSchema,
  })
  .strict()
  .superRefine((trace, context) => {
    const milestones = trace.milestones;
    const issue = (
      key: (typeof CLIENT_MILESTONE_KEYS)[number],
      message: string,
    ) =>
      context.addIssue({
        code: "custom",
        path: ["milestones", key],
        message,
      });
    const requirePredecessor = (
      valueKey: (typeof CLIENT_MILESTONE_KEYS)[number],
      predecessorKey: (typeof CLIENT_MILESTONE_KEYS)[number],
    ) => {
      if (
        milestones[valueKey] !== undefined &&
        milestones[predecessorKey] === undefined
      ) {
        issue(valueKey, `${valueKey} requires ${predecessorKey}`);
      }
    };
    const requireOrder = (
      earlierKey: (typeof CLIENT_MILESTONE_KEYS)[number],
      laterKey: (typeof CLIENT_MILESTONE_KEYS)[number],
    ) => {
      const earlier = milestones[earlierKey];
      const later = milestones[laterKey];
      if (earlier !== undefined && later !== undefined && earlier > later) {
        issue(laterKey, `${laterKey} must not precede ${earlierKey}`);
      }
    };

    requirePredecessor("firstChunkReceivedMs", "streamOpenedMs");
    requirePredecessor("firstTextDeltaReceivedMs", "firstChunkReceivedMs");
    requirePredecessor("firstDomTextMs", "firstTextDeltaReceivedMs");
    requirePredecessor("firstVisibleFrameMs", "firstDomTextMs");
    requirePredecessor("persistedMessageResolvedMs", "streamCompletedMs");

    requireOrder("streamOpenedMs", "firstChunkReceivedMs");
    requireOrder("firstChunkReceivedMs", "firstTextDeltaReceivedMs");
    requireOrder("firstTextDeltaReceivedMs", "streamCompletedMs");
    requireOrder("firstTextDeltaReceivedMs", "firstDomTextMs");
    requireOrder("firstDomTextMs", "firstVisibleFrameMs");
    requireOrder("streamCompletedMs", "persistedMessageResolvedMs");

    if (trace.status === "completed") {
      for (const key of CLIENT_MILESTONE_KEYS) {
        if (milestones[key] === undefined) {
          issue(key, `completed traces require ${key}`);
        }
      }
    }
  });

export type ServerSpanName = (typeof SERVER_SPAN_NAMES)[number];
export type ServerSpanAttributes = z.infer<typeof serverSpanAttributesSchema>;
export type ServerTraceSpanV1 = z.infer<typeof serverTraceSpanSchema>;
export type ServerTraceV1 = z.infer<typeof serverTraceSchema>;
export type ClientTraceV1 = z.infer<typeof clientTraceSchema>;

function serializedByteLength(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function parseBounded<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  if (!result.success) return null;

  const byteLength = serializedByteLength(result.data);
  return byteLength !== null && byteLength <= MAX_TRACE_BYTES
    ? result.data
    : null;
}

export function parseServerTrace(value: unknown): ServerTraceV1 | null {
  return parseBounded(serverTraceSchema, value);
}

export function parseClientTrace(value: unknown): ClientTraceV1 | null {
  return parseBounded(clientTraceSchema, value);
}

export function clientTracesEqual(left: unknown, right: unknown): boolean {
  const parsedLeft = parseClientTrace(left);
  const parsedRight = parseClientTrace(right);
  return (
    parsedLeft !== null &&
    parsedRight !== null &&
    JSON.stringify(parsedLeft) === JSON.stringify(parsedRight)
  );
}
