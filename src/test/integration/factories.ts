import { prisma } from "@/lib/db";

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now()}_${sequence}`;
}

export async function resetIntegrationDb() {
  await prisma.attachment.deleteMany();
  await prisma.artifactVersion.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.voiceUsage.deleteMany();
  await prisma.dailyUsage.deleteMany();
  await prisma.sessionSummary.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.preferences.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.subscription.deleteMany();
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
    guestAbuseIdHash: string | null;
  }> = {},
) {
  return prisma.user.create({
    data: {
      clerkId: overrides.clerkId ?? nextId("clerk"),
      email: overrides.email ?? `${nextId("user")}@example.test`,
      role: overrides.role ?? "USER",
      isGuest: overrides.isGuest ?? false,
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
  return prisma.chat.create({
    data: {
      userId,
      title: overrides.title ?? null,
      customTitle:
        overrides.customTitle ?? (overrides.title !== null && !!overrides.title),
      visibility: overrides.visibility ?? "PRIVATE",
    },
  });
}

export async function createMessage(
  input: {
    userId: string;
    chatId?: string | null;
    role?: "USER" | "ASSISTANT" | "SYSTEM";
    direction?: "INBOUND" | "OUTBOUND";
    content?: string;
    createdAt?: Date;
  } & Partial<{
    feedback: number | null;
  }>,
) {
  const role = input.role ?? "USER";
  const direction =
    input.direction ?? (role === "ASSISTANT" ? "OUTBOUND" : "INBOUND");

  return prisma.message.create({
    data: {
      userId: input.userId,
      chatId: input.chatId ?? null,
      role,
      direction,
      channel: "WEB",
      type: "TEXT",
      content: input.content ?? "message",
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
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
