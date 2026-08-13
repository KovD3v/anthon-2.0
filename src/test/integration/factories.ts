import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now()}_${sequence}`;
}

export async function resetIntegrationDb() {
  await prisma.routineAttempt.deleteMany();
  await prisma.routine.deleteMany();
  await prisma.aiUsageReservation.deleteMany();
  await prisma.uploadReservation.deleteMany();
  await prisma.dailyUploadUsage.deleteMany();
  await prisma.guestAbuseBucket.deleteMany();
  await prisma.modelExperimentResponse.deleteMany();
  await prisma.modelExperimentPair.deleteMany();
  await prisma.modelExperimentParticipant.deleteMany();
  await prisma.modelExperimentVariant.deleteMany();
  await prisma.modelExperimentAudit.deleteMany();
  await prisma.modelExperiment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.voiceUsage.deleteMany();
  await prisma.voiceGenerationJob.deleteMany();
  await prisma.dailyUsage.deleteMany();
  await prisma.sessionSummary.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.preferences.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.channelConnectRequest.deleteMany();
  await prisma.channelLinkToken.deleteMany();
  await prisma.channelIdentity.deleteMany();
  await prisma.organizationAuditLog.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.organizationContract.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(
  overrides: Partial<{
    clerkId: string;
    email: string | null;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
    isGuest: boolean;
    guestTokenHash: string | null;
    guestAbuseIdHash: string | null;
  }> = {},
) {
  return prisma.user.create({
    data: {
      clerkId: overrides.clerkId ?? nextId("clerk"),
      email: overrides.email ?? `${nextId("user")}@example.test`,
      role: overrides.role ?? "USER",
      isGuest: overrides.isGuest ?? false,
      guestTokenHash: overrides.guestTokenHash ?? null,
      guestAbuseIdHash: overrides.guestAbuseIdHash ?? null,
    },
  });
}

export async function createChat(
  userId: string,
  overrides: Partial<{
    title: string | null;
    customTitle: boolean;
    visibility: "PRIVATE" | "PUBLIC";
  }> = {},
) {
  return prisma.$transaction(async (tx) => {
    const chat = await tx.chat.create({
      data: {
        userId,
        title: overrides.title ?? null,
        customTitle:
          overrides.customTitle ??
          (overrides.title !== null && !!overrides.title),
        visibility: overrides.visibility ?? "PRIVATE",
      },
    });
    await tx.conversationThread.create({
      data: {
        userId,
        channel: "WEB",
        externalThreadId: chat.id,
        chatId: chat.id,
      },
    });
    return chat;
  });
}

export async function createMessage(
  input: {
    userId: string;
    chatId?: string | null;
    role?: "USER" | "ASSISTANT" | "SYSTEM";
    direction?: "INBOUND" | "OUTBOUND";
    createdAt?: Date;
    text?: string;
  } & Partial<{
    feedback: number | null;
    metadata: Prisma.InputJsonValue;
  }>,
) {
  const role = input.role ?? "USER";
  const direction =
    input.direction ?? (role === "ASSISTANT" ? "OUTBOUND" : "INBOUND");
  if (!input.chatId) {
    throw new Error("Integration WEB messages require a chatId");
  }
  const thread = await prisma.conversationThread.findUnique({
    where: { chatId: input.chatId },
    select: { id: true, userId: true },
  });
  if (!thread || thread.userId !== input.userId) {
    throw new Error(
      "Integration WEB messages require an owned conversation thread",
    );
  }

  return prisma.message.create({
    data: {
      userId: input.userId,
      chatId: input.chatId,
      conversationThreadId: thread.id,
      role,
      direction,
      channel: "WEB",
      type: "TEXT",
      ...(input.text
        ? {
            parts: [
              { type: "text", text: input.text },
            ] as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

export async function createRoutine(
  userId: string,
  overrides: Partial<{
    sourceChatId: string | null;
    sourceAssistantMessageId: string | null;
    title: string;
    trigger: string;
    durationLabel: string | null;
    steps: Prisma.InputJsonValue;
    completionCue: string;
    status: "ACTIVE" | "ARCHIVED";
    archivedAt: Date | null;
  }> = {},
) {
  return prisma.routine.create({
    data: {
      userId,
      sourceChatId: overrides.sourceChatId ?? null,
      sourceAssistantMessageId: overrides.sourceAssistantMessageId ?? null,
      title: overrides.title ?? "Reset dopo un errore",
      trigger: overrides.trigger ?? "Quando commetti un errore in gara",
      durationLabel:
        overrides.durationLabel === undefined
          ? "60 secondi"
          : overrides.durationLabel,
      steps: overrides.steps ?? [
        "Fermati",
        "Espira lentamente",
        "Scegli il prossimo gesto",
      ],
      completionCue:
        overrides.completionCue ??
        "Riparti con lo sguardo sul compito successivo",
      status: overrides.status ?? "ACTIVE",
      archivedAt: overrides.archivedAt ?? null,
    },
  });
}

export async function createRoutineAttempt(
  routineId: string,
  overrides: Partial<{
    clientActionId: string;
    attemptedAt: Date;
    outcome: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL" | null;
    outcomeNote: string | null;
    outcomeRecordedAt: Date | null;
  }> = {},
) {
  return prisma.routineAttempt.create({
    data: {
      routineId,
      clientActionId: overrides.clientActionId ?? nextId("routine_action"),
      attemptedAt: overrides.attemptedAt,
      outcome: overrides.outcome ?? null,
      outcomeNote: overrides.outcomeNote ?? null,
      outcomeRecordedAt: overrides.outcomeRecordedAt ?? null,
    },
  });
}

export function toAuthUser(user: {
  id: string;
  clerkId: string | null;
  email: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  createdAt: Date;
}) {
  return {
    id: user.id,
    clerkId: user.clerkId ?? "",
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
