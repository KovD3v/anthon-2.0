import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { invalidateFactCache, rememberFactInTransaction } from "./memory-facts";
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
  presentationInboundMessageId: true,
  presentationAssistantMessageId: true,
  presentationInboundMessage: {
    select: {
      id: true,
      userId: true,
      conversationThreadId: true,
      direction: true,
      role: true,
      deletedAt: true,
      createdAt: true,
    },
  },
  presentationAssistantMessage: {
    select: {
      id: true,
      userId: true,
      conversationThreadId: true,
      sourceInboundMessageId: true,
      direction: true,
      role: true,
      deletedAt: true,
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

export async function getUnpresentedMemoryApproval(input: {
  userId: string;
  conversationId: string;
}): Promise<PendingMemoryApproval | null> {
  const now = new Date();
  await prisma.memoryApproval.updateMany({
    where: {
      userId: input.userId,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED", resolvedAt: now },
  });
  const approval = await prisma.memoryApproval.findFirst({
    where: {
      userId: input.userId,
      status: "PENDING",
      expiresAt: { gt: now },
      presentationInboundMessageId: null,
      presentationAssistantMessageId: null,
      sourceInboundMessage: {
        conversationThreadId: input.conversationId,
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    select: pendingApprovalSelect,
  });
  return approval ? toPendingMemoryApproval(approval) : null;
}

export async function markMemoryApprovalPresented(input: {
  userId: string;
  approvalId: string;
  presentationInboundMessageId: string;
  presentationAssistantMessageId: string;
}): Promise<{ status: "presented" | "stale" }> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const inbound = await tx.message.findFirst({
      where: {
        id: input.presentationInboundMessageId,
        userId: input.userId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { id: true, conversationThreadId: true },
    });
    if (!inbound?.conversationThreadId) return { status: "stale" as const };

    const assistant = await tx.message.findFirst({
      where: {
        id: input.presentationAssistantMessageId,
        userId: input.userId,
        conversationThreadId: inbound.conversationThreadId,
        sourceInboundMessageId: inbound.id,
        direction: "OUTBOUND",
        role: "ASSISTANT",
        deletedAt: null,
      },
      select: {
        id: true,
        conversationThreadId: true,
        sourceInboundMessageId: true,
      },
    });
    if (!assistant) return { status: "stale" as const };

    const claimed = await tx.memoryApproval.updateMany({
      where: {
        id: input.approvalId,
        userId: input.userId,
        status: "PENDING",
        expiresAt: { gt: now },
        presentationInboundMessageId: null,
        presentationAssistantMessageId: null,
        sourceInboundMessage: {
          conversationThreadId: inbound.conversationThreadId,
        },
      },
      data: {
        presentationInboundMessageId: inbound.id,
        presentationAssistantMessageId: assistant.id,
      },
    });
    return {
      status: claimed.count === 1 ? ("presented" as const) : ("stale" as const),
    };
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

    const previousInboundMessages = await tx.message.findMany({
      where: {
        userId: input.userId,
        conversationThreadId: input.conversationId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: currentMessage.createdAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 2,
      select: {
        id: true,
        createdAt: true,
        generatedResponse: {
          select: {
            id: true,
            userId: true,
            conversationThreadId: true,
            direction: true,
            role: true,
            deletedAt: true,
          },
        },
      },
    });
    const previousInboundMessage = previousInboundMessages[0];
    const nextMostRecentInboundMessage = previousInboundMessages[1];
    if (
      !previousInboundMessage ||
      (nextMostRecentInboundMessage &&
        nextMostRecentInboundMessage.createdAt.getTime() ===
          previousInboundMessage.createdAt.getTime())
    ) {
      return null;
    }
    const generatedResponse = previousInboundMessage.generatedResponse;
    if (
      !generatedResponse ||
      generatedResponse.userId !== input.userId ||
      generatedResponse.conversationThreadId !== input.conversationId ||
      generatedResponse.direction !== "OUTBOUND" ||
      generatedResponse.role !== "ASSISTANT" ||
      generatedResponse.deletedAt !== null
    ) {
      return null;
    }

    const approval = await tx.memoryApproval.findFirst({
      where: {
        userId: input.userId,
        presentationInboundMessageId: previousInboundMessage.id,
        presentationAssistantMessageId: generatedResponse.id,
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
  const normalized = normalizeApprovalText(text).trim();
  return (
    isStandaloneApprovalDecision(normalized, "approve") ||
    isStandaloneApprovalDecision(normalized, "reject") ||
    /\b(?:salva|salval[oaie]|salvare|salvarl[oaie]|memorizz\w*|ricorda|ricordal[oaie]|ricordarl[oaie]|conserva|conserval[oaie]|conservarl[oaie]|salvataggio|memoria|confermo|acconsento|rifiuto|save|remember|store|confirm|reject)\b/.test(
      normalized,
    )
  );
}

function compactApprovalText(text: string) {
  return text
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneApprovalDecision(
  normalized: string,
  decision: "approve" | "reject",
) {
  const compact = compactApprovalText(normalized);
  const choices =
    decision === "approve"
      ? new Set([
          "si",
          "si grazie",
          "yes",
          "yes thanks",
          "ok",
          "okay",
          "va bene",
          "confermo",
          "acconsento",
          "certo",
        ])
      : new Set(["no", "no grazie", "rifiuto", "annulla", "reject", "cancel"]);
  return choices.has(compact);
}

function hasExplicitApprovalDecision(
  text: string,
  decision: "approve" | "reject",
) {
  const normalized = normalizeApprovalText(text).trim();
  if (isStandaloneApprovalDecision(normalized, decision)) return true;

  const compact = compactApprovalText(normalized);
  const italianAnaphoricSave =
    "(?:salval[oaie]|salvarl[oaie]|memorizzal[oaie]|memorizzarl[oaie]|ricordal[oaie]|ricordarl[oaie]|conserval[oaie]|conservarl[oaie])";
  const englishAnaphoricSave = "(?:save it|remember it|store it)";
  const anaphoricSave = `(?:${italianAnaphoricSave}|${englishAnaphoricSave})`;
  const optionalTail = "(?: (?:in memoria|per favore|grazie|please|thanks))*";

  if (decision === "reject") {
    return (
      new RegExp(
        `^(?:(?:no|rifiuto|annulla|reject|cancel) )?(?:non |don't |do not )?${anaphoricSave}${optionalTail}$`,
      ).test(compact) ||
      /^(?:no )?rifiuto (?:il )?(?:salvataggio|consenso)(?: in memoria)?$/.test(
        compact,
      )
    );
  }

  return new RegExp(
    `^(?:per favore )?(?:(?:si|yes|ok|okay|va bene|confermo|acconsento) )?(?:(?:puoi|puo|potete|you can) )?${anaphoricSave}${optionalTail}$`,
  ).test(compact);
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

  const result = await prisma.$transaction(async (tx) => {
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

    const presentationInbound = approval.presentationInboundMessage;
    const presentationAssistant = approval.presentationAssistantMessage;
    if (
      !approval.presentationInboundMessageId ||
      !approval.presentationAssistantMessageId ||
      typeof approval.value !== "string" ||
      !presentationInbound?.conversationThreadId ||
      presentationInbound.userId !== input.userId ||
      presentationInbound.direction !== "INBOUND" ||
      presentationInbound.role !== "USER" ||
      presentationInbound.deletedAt !== null ||
      !presentationAssistant ||
      presentationAssistant.userId !== input.userId ||
      presentationAssistant.conversationThreadId !==
        presentationInbound.conversationThreadId ||
      presentationAssistant.sourceInboundMessageId !== presentationInbound.id ||
      presentationAssistant.direction !== "OUTBOUND" ||
      presentationAssistant.role !== "ASSISTANT" ||
      presentationAssistant.deletedAt !== null
    ) {
      return { status: "stale" as const };
    }

    const currentMessage = await tx.message.findFirst({
      where: {
        id: input.currentUserMessageId,
        userId: input.userId,
        conversationThreadId: presentationInbound.conversationThreadId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { id: true, createdAt: true, parts: true },
    });
    if (!currentMessage) return { status: "stale" as const };

    const previousInboundMessages = await tx.message.findMany({
      where: {
        userId: input.userId,
        conversationThreadId: presentationInbound.conversationThreadId,
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: currentMessage.createdAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 2,
      select: { id: true, createdAt: true },
    });
    const previousInboundMessage = previousInboundMessages[0];
    const nextMostRecentInboundMessage = previousInboundMessages[1];
    if (
      !previousInboundMessage ||
      (nextMostRecentInboundMessage &&
        nextMostRecentInboundMessage.createdAt.getTime() ===
          previousInboundMessage.createdAt.getTime())
    ) {
      return { status: "stale" as const };
    }
    if (previousInboundMessage?.id !== approval.presentationInboundMessageId) {
      return { status: "stale" as const };
    }

    if (
      !hasExplicitApprovalDecision(
        getMessageText(currentMessage.parts),
        input.decision,
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

    const memory = await rememberFactInTransaction(tx, {
      userId: input.userId,
      key: approval.key,
      value: approval.value,
      category: approval.category,
      confidence: approval.confidence,
      sensitivity: "HIGH",
      origin: "CONFIRMED",
      sourceMessageId: approval.sourceInboundMessageId,
      sourceThreadId: presentationInbound.conversationThreadId,
      dedupeKey: `approval:${approval.id}`,
    });
    if (
      (memory.status !== "saved" && memory.status !== "duplicate") ||
      !memory.factId
    ) {
      throw new Error("Approved memory fact could not be persisted");
    }

    return { status: "approved" as const, memoryId: memory.factId };
  });
  if (result.status === "approved") invalidateFactCache(input.userId);
  return result;
}
