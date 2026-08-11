import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/db";

export type ConversationEvidencePacket = {
  id: string;
  summary: string;
  excerpts: Array<{ role: "user" | "assistant"; text: string }>;
  occurredAt: string;
  channel: "WEB" | "TELEGRAM" | "WHATSAPP";
  relevance: number;
};

export type ConversationRecallResult = {
  packets: ConversationEvidencePacket[];
  scope: "current_thread" | "all_channels";
  degraded: boolean;
  elapsedMs: number;
};

type SearchRow = {
  id: string;
  content: string;
  summary: string | null;
  sourceCreatedAt: Date;
  channel: ConversationEvidencePacket["channel"];
  relevance: number | string;
};

const evidenceRegistry = new Map<
  string,
  { userId: string; chunkId: string; expiresAt: number }
>();
const EVIDENCE_TTL_MS = 10 * 60_000;

function registerEvidence(userId: string, chunkId: string): string {
  const now = Date.now();
  if (evidenceRegistry.size > 2_048) {
    for (const [key, value] of evidenceRegistry) {
      if (value.expiresAt <= now) evidenceRegistry.delete(key);
    }
  }
  const id = randomUUID();
  evidenceRegistry.set(id, {
    userId,
    chunkId,
    expiresAt: now + EVIDENCE_TTL_MS,
  });
  return id;
}

function excerptsFromContent(
  content: string,
  budget: number,
): Array<{ role: "user" | "assistant"; text: string }> {
  let used = 0;
  const excerpts: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const line of content.split("\n")) {
    const match = /^(user|assistant):\s*(.+)$/i.exec(line.trim());
    if (!match) continue;
    const available = Math.max(0, budget - used);
    if (!available) break;
    const text = (match[2] ?? "").slice(0, available).trim();
    if (!text) continue;
    excerpts.push({
      role: match[1]?.toLowerCase() === "user" ? "user" : "assistant",
      text,
    });
    used += text.length;
  }
  return excerpts;
}

async function queryScope(input: {
  userId: string;
  conversationThreadId: string;
  query: string;
  embedding: number[] | null;
  currentOnly: boolean;
}): Promise<SearchRow[]> {
  const vector = input.embedding ? `[${input.embedding.join(",")}]` : null;
  const threadClause = input.currentOnly
    ? Prisma.sql`AND crc."conversationThreadId" = ${input.conversationThreadId}`
    : Prisma.sql`AND crc."conversationThreadId" <> ${input.conversationThreadId}`;
  return prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT crc."id", crc."content", crc."summary", crc."channel",
      crc."sourceCreatedAt",
      (
        CASE WHEN ${vector}::text IS NULL THEN 0
          ELSE 0.55 * (1 - (crc."embedding" <=> ${vector}::vector)) END
        + 0.30 * ts_rank_cd(to_tsvector('simple', crc."content"), plainto_tsquery('simple', ${input.query}))
        + 0.10 * (1 / (1 + EXTRACT(EPOCH FROM (NOW() - crc."sourceCreatedAt")) / 2592000))
        + CASE WHEN crc."conversationThreadId" = ${input.conversationThreadId} THEN 0.05 ELSE 0 END
      ) AS relevance
    FROM "ConversationRecallChunk" crc
    JOIN "ConversationThread" ct ON ct."id" = crc."conversationThreadId"
      AND ct."userId" = crc."userId"
    JOIN "Message" m ON m."id" = crc."throughMessageId"
      AND m."userId" = crc."userId"
      AND m."conversationThreadId" = crc."conversationThreadId"
    WHERE crc."userId" = ${input.userId}
      AND m."deletedAt" IS NULL
      ${threadClause}
    ORDER BY relevance DESC, crc."sourceCreatedAt" DESC
    LIMIT 4
  `);
}

function packetize(
  userId: string,
  rows: SearchRow[],
): ConversationEvidencePacket[] {
  let remaining = 3_000;
  const packets: ConversationEvidencePacket[] = [];
  for (const row of rows.slice(0, 4)) {
    if (remaining <= 0) break;
    const excerpts = excerptsFromContent(row.content, remaining);
    const used = excerpts.reduce((sum, item) => sum + item.text.length, 0);
    if (!used) continue;
    remaining -= used;
    packets.push({
      id: registerEvidence(userId, row.id),
      summary: (
        row.summary?.trim() || excerpts.map((item) => item.text).join(" ")
      ).slice(0, 400),
      excerpts,
      occurredAt: row.sourceCreatedAt.toISOString(),
      channel: row.channel,
      relevance: Math.max(0, Math.min(1, Number(row.relevance) || 0)),
    });
  }
  return packets;
}

export async function searchPastConversations(input: {
  userId: string;
  conversationThreadId: string;
  query: string;
  scope?: "current_thread" | "all_channels";
}): Promise<ConversationRecallResult> {
  const started = performance.now();
  const query = input.query.trim().slice(0, 500);
  if (!query)
    return {
      packets: [],
      scope: "current_thread",
      degraded: false,
      elapsedMs: 0,
    };

  let degraded = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 350);
  try {
    const embedding = await generateEmbedding(query, {
      abortSignal: controller.signal,
      timeoutMs: 120,
    });
    degraded = embedding === null;
    const current = await queryScope({
      ...input,
      query,
      embedding,
      currentOnly: true,
    });
    if (current.length >= 2 || input.scope !== "all_channels") {
      return {
        packets: packetize(input.userId, current),
        scope: "current_thread",
        degraded,
        elapsedMs: Math.round(performance.now() - started),
      };
    }
    const global = await queryScope({
      ...input,
      query,
      embedding,
      currentOnly: false,
    });
    const deduped = [...current, ...global].filter(
      (row, index, rows) =>
        rows.findIndex((candidate) => candidate.id === row.id) === index,
    );
    return {
      packets: packetize(input.userId, deduped),
      scope: "all_channels",
      degraded,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      packets: [],
      scope: "current_thread",
      degraded: true,
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

function textFromParts(parts: unknown, mediaType: string | null) {
  if (Array.isArray(parts)) {
    const text = parts
      .filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type === "text",
      )
      .map((part) => (part as { text?: unknown }).text)
      .filter((text): text is string => typeof text === "string")
      .join("\n")
      .trim();
    if (text) return text;
  }
  return mediaType ? `[media: ${mediaType}]` : "";
}

export async function expandConversationEvidence(input: {
  userId: string;
  evidenceId: string;
  before?: number;
  after?: number;
}): Promise<ConversationEvidencePacket | null> {
  const registered = evidenceRegistry.get(input.evidenceId);
  if (
    !registered ||
    registered.userId !== input.userId ||
    registered.expiresAt <= Date.now()
  ) {
    evidenceRegistry.delete(input.evidenceId);
    return null;
  }
  const chunk = await prisma.conversationRecallChunk.findFirst({
    where: { id: registered.chunkId, userId: input.userId },
    select: {
      conversationThreadId: true,
      startMessageId: true,
      endMessageId: true,
      sourceCreatedAt: true,
      channel: true,
    },
  });
  if (!chunk) return null;
  const before = Math.max(0, Math.min(3, input.before ?? 2));
  const after = Math.max(0, Math.min(3, input.after ?? 2));
  const messages = await prisma.message.findMany({
    where: {
      userId: input.userId,
      conversationThreadId: chunk.conversationThreadId,
      deletedAt: null,
      role: { in: ["USER", "ASSISTANT"] },
    },
    cursor: { id: chunk.endMessageId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: before + after + 1,
    select: { role: true, parts: true, mediaType: true },
  });
  if (messages.length === 0) return null;
  let remaining = 4_000;
  const excerpts = messages.toReversed().flatMap((message) => {
    if (remaining <= 0) return [];
    const text = textFromParts(message.parts, message.mediaType).slice(
      0,
      remaining,
    );
    remaining -= text.length;
    return text
      ? [
          {
            role:
              message.role === "USER"
                ? ("user" as const)
                : ("assistant" as const),
            text,
          },
        ]
      : [];
  });
  return {
    id: input.evidenceId,
    summary: excerpts
      .map((item) => item.text)
      .join(" ")
      .slice(0, 400),
    excerpts,
    occurredAt: chunk.sourceCreatedAt.toISOString(),
    channel: chunk.channel,
    relevance: 1,
  };
}
