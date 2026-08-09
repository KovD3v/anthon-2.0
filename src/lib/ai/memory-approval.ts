import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { isExactStableMemoryKey } from "./memory-target";

const MEMORY_APPROVAL_TTL_MS = 15 * 60 * 1000;

const pendingApprovalSelect = {
  id: true,
  userId: true,
  sourceInboundMessageId: true,
  key: true,
  value: true,
  category: true,
  confidence: true,
  expiresAt: true,
} satisfies Prisma.MemoryApprovalSelect;

const resolvableApprovalSelect = {
  ...pendingApprovalSelect,
  sourceInboundMessage: {
    select: {
      id: true,
      userId: true,
      conversationThreadId: true,
      createdAt: true,
      generatedResponse: {
        select: { id: true, userId: true },
      },
    },
  },
} satisfies Prisma.MemoryApprovalSelect;

type PendingApprovalRow = {
  id: string;
  userId: string;
  sourceInboundMessageId: string;
  key: string;
  value: unknown;
  category: string;
  confidence: number;
  expiresAt: Date;
};

export type PendingMemoryApproval = PendingApprovalRow;

function toPendingMemoryApproval(
  approval: PendingApprovalRow,
): PendingMemoryApproval {
  return {
    id: approval.id,
    userId: approval.userId,
    sourceInboundMessageId: approval.sourceInboundMessageId,
    key: approval.key,
    value: approval.value,
    category: approval.category,
    confidence: approval.confidence,
    expiresAt: approval.expiresAt,
  };
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Memory approval value must be JSON serializable");
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function assertApprovalInput(input: { key: string; confidence: number }) {
  if (!isExactStableMemoryKey(input.key)) {
    throw new Error("Memory approval requires one exact stable key");
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new Error("Memory approval confidence must be between 0 and 1");
  }
}

export async function createMemoryApproval(input: {
  userId: string;
  sourceInboundMessageId: string;
  key: string;
  value: unknown;
  category: string;
  confidence: number;
}): Promise<PendingMemoryApproval> {
  assertApprovalInput(input);
  const value = toInputJsonValue(input.value);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MEMORY_APPROVAL_TTL_MS);

  return prisma.$transaction(async (tx) => {
    const sourceInboundMessage = await tx.message.findFirst({
      where: {
        id: input.sourceInboundMessageId,
        userId: input.userId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sourceInboundMessage) {
      throw new Error("Inbound message is not attributable to the user");
    }

    const existing = await tx.memoryApproval.findFirst({
      where: {
        userId: input.userId,
        sourceInboundMessageId: input.sourceInboundMessageId,
        key: input.key,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: pendingApprovalSelect,
    });
    if (existing) {
      return toPendingMemoryApproval(existing);
    }

    const approval = await tx.memoryApproval.create({
      data: {
        userId: input.userId,
        sourceInboundMessageId: input.sourceInboundMessageId,
        key: input.key,
        value,
        category: input.category,
        confidence: input.confidence,
        expiresAt,
      },
      select: pendingApprovalSelect,
    });

    return toPendingMemoryApproval(approval);
  });
}

export async function getImmediatelyAttributableApproval(input: {
  userId: string;
  conversationId: string;
  currentUserMessageId: string;
}): Promise<PendingMemoryApproval | null> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.memoryApproval.updateMany({
      where: {
        userId: input.userId,
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED", resolvedAt: now },
    });

    const currentMessage = await tx.message.findFirst({
      where: {
        id: input.currentUserMessageId,
        userId: input.userId,
        conversationThreadId: input.conversationId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { id: true, createdAt: true },
    });
    if (!currentMessage) return null;

    const previousInboundMessage = await tx.message.findFirst({
      where: {
        userId: input.userId,
        conversationThreadId: input.conversationId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: currentMessage.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        generatedResponse: {
          select: { id: true, userId: true },
        },
      },
    });
    if (
      !previousInboundMessage?.generatedResponse ||
      previousInboundMessage.generatedResponse.userId !== input.userId
    ) {
      return null;
    }

    const approval = await tx.memoryApproval.findFirst({
      where: {
        userId: input.userId,
        sourceInboundMessageId: previousInboundMessage.id,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: pendingApprovalSelect,
    });

    return approval ? toPendingMemoryApproval(approval) : null;
  });
}

function getMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part): part is { type: string; text: string } =>
      Boolean(
        part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string",
      ),
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function normalizeApprovalText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT");
}

export function mightResolvePendingMemoryApproval(text: string) {
  const normalized = normalizeApprovalText(text);
  return /\b(?:salva|salvare|salvarl[oa]|memorizz\w*|ricorda|ricordarl[oa]|conserva|conservarl[oa]|salvataggio|memoria|confermo|acconsento|rifiuto|save|remember|store|confirm|reject)\b/.test(
    normalized,
  );
}

function approvalAttributionTokens(approval: {
  key: string;
  value: unknown;
  category: string;
}) {
  const value =
    typeof approval.value === "string"
      ? approval.value
      : JSON.stringify(approval.value);
  return new Set(
    normalizeApprovalText(`${approval.key} ${approval.category} ${value}`)
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= 4 &&
          !new Set([
            "della",
            "delle",
            "degli",
            "questo",
            "questa",
            "quello",
            "quella",
            "with",
            "that",
          ]).has(token),
      ),
  );
}

function hasExplicitApprovalDecision(
  text: string,
  decision: "approve" | "reject",
  approval: { key: string; value: unknown; category: string },
) {
  const normalized = normalizeApprovalText(text).trim();
  const explicitRejection =
    /\b(?:no|non|rifiuto|annulla)\b[^.!?]{0,100}\b(?:salvarl[oa]|memorizzarl[oa]|ricordarl[oa]|conservarl[oa]|salvataggio|memoria)\b/.test(
      normalized,
    ) ||
    /\b(?:don't|do not|reject|cancel)\b[^.!?]{0,100}\b(?:save it|remember it|store it|saving)\b/.test(
      normalized,
    );
  if (decision === "reject") return explicitRejection;
  if (explicitRejection) return false;

  const directConfirmation =
    /\b(?:si|ok|va bene|confermo|acconsento|puoi)\b[^.!?]{0,100}\b(?:salvarl[oa]|memorizzarl[oa]|ricordarl[oa]|conservarl[oa]|salvataggio)\b/.test(
      normalized,
    ) ||
    /\b(?:yes|ok|confirm|i agree|you can)\b[^.!?]{0,100}\b(?:save it|remember it|store it|saving)\b/.test(
      normalized,
    );
  if (directConfirmation) return true;

  const explicitSave =
    /\b(?:salva|salvare|memorizza|memorizzare|ricorda|conserva|save|remember|store)\b/.test(
      normalized,
    );
  if (
    !explicitSave ||
    /\b(?:ricorda|salva|memorizza)\s+che\b/.test(normalized)
  ) {
    return false;
  }

  const messageTokens = new Set(
    normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 4),
  );
  const overlap = [...approvalAttributionTokens(approval)].filter((token) =>
    messageTokens.has(token),
  );
  return overlap.length >= 2;
}

export async function resolveMemoryApproval(input: {
  userId: string;
  approvalId: string;
  decision: "approve" | "reject";
  currentUserMessageId: string;
}): Promise<{
  status: "approved" | "rejected" | "stale";
  memoryId?: string;
}> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const approval = await tx.memoryApproval.findFirst({
      where: {
        id: input.approvalId,
        userId: input.userId,
        status: "PENDING",
      },
      select: resolvableApprovalSelect,
    });
    if (!approval) return { status: "stale" as const };

    if (approval.expiresAt <= now) {
      await tx.memoryApproval.updateMany({
        where: {
          id: input.approvalId,
          userId: input.userId,
          status: "PENDING",
        },
        data: { status: "EXPIRED", resolvedAt: now },
      });
      return { status: "stale" as const };
    }

    const sourceMessage = approval.sourceInboundMessage;
    if (
      !sourceMessage.conversationThreadId ||
      sourceMessage.userId !== input.userId ||
      !sourceMessage.generatedResponse ||
      sourceMessage.generatedResponse.userId !== input.userId
    ) {
      return { status: "stale" as const };
    }

    const currentMessage = await tx.message.findFirst({
      where: {
        id: input.currentUserMessageId,
        userId: input.userId,
        conversationThreadId: sourceMessage.conversationThreadId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { id: true, createdAt: true, parts: true },
    });
    if (!currentMessage) return { status: "stale" as const };

    const previousInboundMessage = await tx.message.findFirst({
      where: {
        userId: input.userId,
        conversationThreadId: sourceMessage.conversationThreadId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: currentMessage.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (previousInboundMessage?.id !== approval.sourceInboundMessageId) {
      return { status: "stale" as const };
    }

    if (
      !hasExplicitApprovalDecision(
        getMessageText(currentMessage.parts),
        input.decision,
        approval,
      ) ||
      !isExactStableMemoryKey(approval.key)
    ) {
      return { status: "stale" as const };
    }

    const status = input.decision === "approve" ? "APPROVED" : "REJECTED";
    const claimed = await tx.memoryApproval.updateMany({
      where: {
        id: input.approvalId,
        userId: input.userId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { status, resolvedAt: now },
    });
    if (claimed.count !== 1) return { status: "stale" as const };

    if (input.decision === "reject") {
      return { status: "rejected" as const };
    }

    const timestamp = now.toISOString();
    const value = {
      content: approval.value,
      category: approval.category,
      confidence: approval.confidence,
      updatedAt: timestamp,
    } satisfies Prisma.InputJsonObject;
    const memory = await tx.memory.upsert({
      where: {
        userId_key: { userId: input.userId, key: approval.key },
      },
      update: {
        category: approval.category,
        value,
      },
      create: {
        userId: input.userId,
        key: approval.key,
        category: approval.category,
        value: { ...value, createdAt: timestamp },
      },
      select: { id: true },
    });

    return { status: "approved" as const, memoryId: memory.id };
  });
}
