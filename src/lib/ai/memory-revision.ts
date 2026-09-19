import { z } from "zod";
import type { Memory, Prisma } from "@/generated/prisma";

const stateSchema = z.object({
  key: z.string(),
  category: z.string(),
  origin: z.enum(["EXPLICIT", "INFERRED", "CONFIRMED", "MIGRATED"]),
  sensitivity: z.enum(["LOW", "HIGH"]),
  confidence: z.number(),
  status: z.enum(["ACTIVE", "SUPERSEDED", "DELETED"]),
  sourceMessageId: z.string().nullable(),
  sourceThreadId: z.string().nullable(),
  observedAt: z.iso.datetime(),
  lastConfirmedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});

/** Keep the previous fact's state with its value so Undo restores attribution too. */
export function snapshotMemory(memory: Memory): Prisma.InputJsonObject {
  return {
    ...(memory.value as Prisma.JsonObject),
    _undoState: {
      key: memory.key,
      category: memory.category,
      origin: memory.origin,
      sensitivity: memory.sensitivity,
      confidence: memory.confidence,
      status: memory.status,
      sourceMessageId: memory.sourceMessageId,
      sourceThreadId: memory.sourceThreadId,
      observedAt: memory.observedAt.toISOString(),
      lastConfirmedAt: memory.lastConfirmedAt?.toISOString() ?? null,
      expiresAt: memory.expiresAt?.toISOString() ?? null,
    },
  };
}

export function previousMemoryState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { _undoState, ...previousValue } = value as Record<string, unknown>;
  const parsed = stateSchema.safeParse(_undoState);
  if (!parsed.success || typeof previousValue.content !== "string") return null;
  return {
    ...parsed.data,
    value: previousValue as Prisma.InputJsonObject,
    observedAt: new Date(parsed.data.observedAt),
    lastConfirmedAt: parsed.data.lastConfirmedAt
      ? new Date(parsed.data.lastConfirmedAt)
      : null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  };
}

export function memoryValueRevisionId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const revisionId = (value as { revisionId?: unknown }).revisionId;
  return typeof revisionId === "string" ? revisionId : undefined;
}
