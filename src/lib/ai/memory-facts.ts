import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { canonicalizeKnowledgeCandidate } from "./memory-canonicalization";

const memoryLogger = createLogger("ai");
const DEFAULT_RECALL_LIMIT = 4;
const MAX_RECALL_LIMIT = 8;
const MAX_FACT_SNAPSHOT_SIZE = 64;
const FACT_CACHE_TTL_MS = 30_000;

type StoredMemoryValue = {
  content?: unknown;
};

type FactCacheEntry = {
  facts: RecalledFact[];
  expiresAt: number;
};

const factCache = new Map<string, FactCacheEntry>();

export type RecalledFact = {
  id: string;
  key: string;
  content: string;
  category: string;
  origin: "EXPLICIT" | "INFERRED" | "CONFIRMED" | "MIGRATED";
  confidence: number;
  observedAt: Date;
  updatedAt: Date;
};

export type FactMutationInput = {
  userId: string;
  key: string;
  value: string;
  category: string;
  confidence: number;
  sensitivity: "LOW" | "HIGH";
  origin: "EXPLICIT" | "INFERRED" | "CONFIRMED" | "MIGRATED";
  sourceMessageId: string;
  sourceThreadId?: string;
  dedupeKey: string;
  observedAt?: Date;
  expiresAt?: Date | null;
};

export type FactMutationResult = {
  status: "saved" | "forgotten" | "duplicate" | "not_found" | "rejected";
  factId?: string;
};

export function invalidateFactCache(userId: string) {
  factCache.delete(userId);
}

function projectFact(memory: {
  id: string;
  key: string;
  value: Prisma.JsonValue;
  category: string;
  origin: RecalledFact["origin"];
  confidence: number;
  observedAt: Date;
  updatedAt: Date;
}): RecalledFact | null {
  const value = memory.value as StoredMemoryValue;
  if (typeof value.content !== "string" || !value.content.trim()) return null;

  return {
    id: memory.id,
    key: memory.key,
    content: value.content.trim(),
    category: memory.category,
    origin: memory.origin,
    confidence: memory.confidence,
    observedAt: memory.observedAt,
    updatedAt: memory.updatedAt,
  };
}

async function loadFactSnapshot(userId: string, now: Date) {
  const cached = factCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.facts;

  const memories = await prisma.memory.findMany({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_FACT_SNAPSHOT_SIZE,
  });
  const facts = memories.flatMap((memory) => {
    const fact = projectFact(memory);
    return fact ? [fact] : [];
  });
  factCache.set(userId, {
    facts,
    expiresAt: Date.now() + FACT_CACHE_TTL_MS,
  });
  return facts;
}

function queryTokens(value: string) {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

function scoreFact(fact: RecalledFact, query: Set<string>) {
  const factTokens = queryTokens(
    `${fact.key} ${fact.category} ${fact.content}`,
  );
  let overlap = 0;
  for (const token of query) {
    if (factTokens.has(token)) overlap += 1;
  }
  const originWeight =
    fact.origin === "CONFIRMED"
      ? 0.35
      : fact.origin === "EXPLICIT"
        ? 0.3
        : fact.origin === "MIGRATED"
          ? 0.15
          : 0.05;
  return overlap * 10 + originWeight + fact.confidence * 0.2;
}

export async function recallFacts({
  userId,
  query,
  categories,
  limit = DEFAULT_RECALL_LIMIT,
  now = new Date(),
}: {
  userId: string;
  query: string;
  categories?: string[];
  limit?: number;
  now?: Date;
}): Promise<{ facts: RecalledFact[]; degraded: boolean }> {
  const take = Math.min(MAX_RECALL_LIMIT, Math.max(1, Math.floor(limit)));

  try {
    const snapshot = await loadFactSnapshot(userId, now);
    const categorySet = categories?.length ? new Set(categories) : null;
    const tokens = queryTokens(query);
    const facts = snapshot
      .filter((fact) => !categorySet || categorySet.has(fact.category))
      .map((fact) => ({ fact, score: scoreFact(fact, tokens) }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.fact.updatedAt.getTime() - left.fact.updatedAt.getTime(),
      )
      .slice(0, take)
      .map(({ fact }) => fact);

    return { facts, degraded: false };
  } catch (error) {
    memoryLogger.warn(
      "ai.memory.fact_recall_failed",
      "Durable fact recall failed",
      { errorName: error instanceof Error ? error.name : "unknown", userId },
    );
    return { facts: [], degraded: true };
  }
}

function storedValue(input: FactMutationInput, timestamp: string) {
  return {
    content: input.value.trim(),
    category: input.category,
    confidence: input.confidence,
    updatedAt: timestamp,
  } satisfies Prisma.InputJsonObject;
}

function canonicalFactInput(
  input: FactMutationInput,
): FactMutationInput | null {
  const candidate = canonicalizeKnowledgeCandidate({
    key: input.key,
    value: input.value,
    category: input.category,
  });
  if (!candidate || candidate.destination !== "memory") return null;
  return {
    ...input,
    key: candidate.key,
    value: candidate.value,
    category: candidate.category,
  };
}

export async function rememberFact(
  requestedInput: FactMutationInput,
): Promise<FactMutationResult> {
  const input = canonicalFactInput(requestedInput);
  if (!input) return { status: "rejected" };
  if (!input.value.trim() || input.confidence < 0 || input.confidence > 1) {
    return { status: "rejected" };
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.memoryRevision.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { memoryId: true },
      });
      if (duplicate) {
        return { status: "duplicate", factId: duplicate.memoryId } as const;
      }

      const previous = await transaction.memory.findFirst({
        where: { userId: input.userId, key: input.key },
      });
      const timestamp = new Date().toISOString();
      const nextValue = storedValue(input, timestamp);
      const memory = await transaction.memory.upsert({
        where: { userId_key: { userId: input.userId, key: input.key } },
        update: {
          value: nextValue,
          category: input.category,
          confidence: input.confidence,
          sensitivity: input.sensitivity,
          origin: input.origin,
          status: "ACTIVE",
          sourceMessageId: input.sourceMessageId,
          sourceThreadId: input.sourceThreadId,
          observedAt: input.observedAt ?? new Date(),
          expiresAt: input.expiresAt,
          ...(input.origin === "CONFIRMED"
            ? { lastConfirmedAt: new Date() }
            : {}),
        },
        create: {
          userId: input.userId,
          key: input.key,
          value: nextValue,
          category: input.category,
          confidence: input.confidence,
          sensitivity: input.sensitivity,
          origin: input.origin,
          sourceMessageId: input.sourceMessageId,
          sourceThreadId: input.sourceThreadId,
          observedAt: input.observedAt ?? new Date(),
          expiresAt: input.expiresAt,
          ...(input.origin === "CONFIRMED"
            ? { lastConfirmedAt: new Date() }
            : {}),
        },
        select: { id: true },
      });
      await transaction.memoryRevision.create({
        data: {
          userId: input.userId,
          memoryId: memory.id,
          sourceMessageId: input.sourceMessageId,
          previousValue: previous?.value as Prisma.InputJsonValue | undefined,
          nextValue,
          origin: input.origin,
          reason: "remember",
          dedupeKey: input.dedupeKey,
        },
      });
      return { status: "saved", factId: memory.id } as const;
    });
    if (result.status === "saved") invalidateFactCache(input.userId);
    return result;
  } catch (error) {
    memoryLogger.warn(
      "ai.memory.fact_save_failed",
      "Durable fact save failed",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        userId: input.userId,
      },
    );
    return { status: "rejected" };
  }
}

export async function reviseFact(
  requestedInput: FactMutationInput & { factId: string },
): Promise<FactMutationResult> {
  const canonicalInput = canonicalFactInput(requestedInput);
  if (!canonicalInput) return { status: "rejected" };
  const input = { ...canonicalInput, factId: requestedInput.factId };
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.memoryRevision.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { memoryId: true },
      });
      if (duplicate) {
        return { status: "duplicate", factId: duplicate.memoryId } as const;
      }
      const previous = await transaction.memory.findFirst({
        where: { id: input.factId, userId: input.userId, status: "ACTIVE" },
      });
      if (!previous) return { status: "not_found" } as const;

      const nextValue = storedValue(input, new Date().toISOString());
      const memory = await transaction.memory.update({
        where: { id: input.factId },
        data: {
          key: input.key,
          value: nextValue,
          category: input.category,
          confidence: input.confidence,
          sensitivity: input.sensitivity,
          origin: input.origin,
          sourceMessageId: input.sourceMessageId,
          sourceThreadId: input.sourceThreadId,
          observedAt: input.observedAt ?? new Date(),
          expiresAt: input.expiresAt,
          ...(input.origin === "CONFIRMED"
            ? { lastConfirmedAt: new Date() }
            : {}),
        },
        select: { id: true },
      });
      await transaction.memoryRevision.create({
        data: {
          userId: input.userId,
          memoryId: memory.id,
          sourceMessageId: input.sourceMessageId,
          previousValue: previous.value as Prisma.InputJsonValue,
          nextValue,
          origin: input.origin,
          reason: "revise",
          dedupeKey: input.dedupeKey,
        },
      });
      return { status: "saved", factId: memory.id } as const;
    });
    if (result.status === "saved") invalidateFactCache(input.userId);
    return result;
  } catch (error) {
    memoryLogger.warn(
      "ai.memory.fact_revision_failed",
      "Durable fact revision failed",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        userId: input.userId,
      },
    );
    return { status: "rejected" };
  }
}

export async function forgetFact(input: {
  userId: string;
  factId: string;
  sourceMessageId: string;
  dedupeKey: string;
}): Promise<FactMutationResult> {
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.memoryRevision.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { memoryId: true },
      });
      if (duplicate) {
        return { status: "duplicate", factId: duplicate.memoryId } as const;
      }
      const previous = await transaction.memory.findFirst({
        where: { id: input.factId, userId: input.userId, status: "ACTIVE" },
      });
      if (!previous) return { status: "not_found" } as const;

      const memory = await transaction.memory.update({
        where: { id: input.factId },
        data: { status: "DELETED" },
        select: { id: true },
      });
      await transaction.memoryRevision.create({
        data: {
          userId: input.userId,
          memoryId: memory.id,
          sourceMessageId: input.sourceMessageId,
          previousValue: previous.value as Prisma.InputJsonValue,
          nextValue: undefined,
          origin: "EXPLICIT",
          reason: "forget",
          dedupeKey: input.dedupeKey,
        },
      });
      return { status: "forgotten", factId: memory.id } as const;
    });
    if (result.status === "forgotten") invalidateFactCache(input.userId);
    return result;
  } catch (error) {
    memoryLogger.warn(
      "ai.memory.fact_forget_failed",
      "Durable fact forget failed",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        userId: input.userId,
      },
    );
    return { status: "rejected" };
  }
}
