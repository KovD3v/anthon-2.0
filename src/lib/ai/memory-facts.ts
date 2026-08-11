import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const memoryLogger = createLogger("ai");
const DEFAULT_RECALL_LIMIT = 4;
const MAX_RECALL_LIMIT = 8;

type StoredMemoryValue = {
  content?: unknown;
};

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

export async function recallFacts({
  userId,
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
    const memories = await prisma.memory.findMany({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(categories?.length ? { category: { in: categories } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take,
    });

    const facts = memories.flatMap((memory) => {
      const value = memory.value as StoredMemoryValue;
      if (typeof value.content !== "string" || !value.content.trim()) {
        return [];
      }

      return [
        {
          id: memory.id,
          key: memory.key,
          content: value.content.trim(),
          category: memory.category,
          origin: memory.origin,
          confidence: memory.confidence,
          observedAt: memory.observedAt,
          updatedAt: memory.updatedAt,
        },
      ];
    });

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
