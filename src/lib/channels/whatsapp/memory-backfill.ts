import { consolidateTurnMemory } from "@/lib/ai/memory-consolidator";
import { prisma } from "@/lib/db";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { PlanResolutionError } from "@/lib/plans";
import { getTextFromParts } from "@/lib/utils/message-parts";

const MAX_MEMORIES = 3;
const MAX_TURNS = 5;

export async function backfillLinkedWhatsAppMemories({
  userId,
  externalThreadId,
  before,
}: {
  userId: string;
  externalThreadId: string;
  before: Date;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isGuest: true,
      role: true,
      subscription: { select: { status: true, planId: true } },
    },
  });
  if (!user || user.isGuest) return { status: "ineligible" as const };

  try {
    await resolveEffectiveEntitlements({
      userId: user.id,
      isGuest: false,
      userRole: user.role,
      subscriptionStatus: user.subscription?.status,
      planId: user.subscription?.planId,
    });
  } catch (error) {
    if (
      error instanceof PlanResolutionError &&
      error.reason === "PAID_ACCESS_REQUIRED"
    ) {
      return { status: "ineligible" as const };
    }
    throw error;
  }

  const messages = await prisma.message.findMany({
    where: {
      userId,
      channel: "WHATSAPP",
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
      createdAt: { lte: before },
      externalInboundStatus: "COMPLETED",
      conversationThread: { externalThreadId },
    },
    select: {
      id: true,
      conversationThreadId: true,
      parts: true,
      generatedResponse: { select: { parts: true, deletedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const turns = messages
    .map((message) => ({
      id: message.id,
      conversationThreadId: message.conversationThreadId,
      userText: getTextFromParts(message.parts),
      assistantText: getTextFromParts(message.generatedResponse?.parts),
      assistantDeletedAt: message.generatedResponse?.deletedAt,
    }))
    .filter(
      (turn) =>
        turn.userText.trim().length >= 10 &&
        turn.assistantText.trim().length > 0 &&
        turn.assistantDeletedAt === null,
    )
    .slice(0, MAX_TURNS)
    .reverse();

  let persisted = 0;
  let approvalsCreated = 0;
  for (const turn of turns) {
    const report = await consolidateTurnMemory({
      userId,
      inboundMessageId: turn.id,
      ...(turn.conversationThreadId
        ? { conversationThreadId: turn.conversationThreadId }
        : {}),
      userText: turn.userText,
      assistantText: turn.assistantText,
      maxCandidates: 1,
      memoryOnly: true,
    });
    persisted += report.persisted;
    approvalsCreated += report.approvalsCreated;
    if (persisted + approvalsCreated >= MAX_MEMORIES) break;
  }

  return {
    status: "completed" as const,
    turnsConsidered: turns.length,
    persisted,
    approvalsCreated,
  };
}
