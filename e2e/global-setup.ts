import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

export const E2E_ACCESS_USERS = {
  paid: {
    clerkId: "e2e-playwright-user",
    chatId: "e2e-paid-chat",
  },
  noAccess: {
    clerkId: "e2e-no-access-user",
    chatId: "e2e-no-access-chat",
  },
  removedSeat: {
    clerkId: "e2e-removed-seat-user",
    chatId: "e2e-removed-seat-chat",
  },
  onboarding: {
    clerkId: "e2e-onboarding-user",
  },
} as const;

export function assertEphemeralE2EBranch() {
  const ephemeralBranchId = process.env.E2E_EPHEMERAL_BRANCH_ID?.trim();
  if (!ephemeralBranchId?.startsWith("br-")) {
    throw new Error(
      "E2E_EPHEMERAL_BRANCH_ID is required. Run `bun run test:e2e` so the suite uses an isolated Neon branch.",
    );
  }
}

export async function seedAuthenticatedE2EUser() {
  const clerkId = process.env.E2E_AUTH_CLERK_ID?.trim();
  const secret = process.env.E2E_AUTH_SECRET?.trim();
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!clerkId || !secret || !connectionString) {
    throw new Error(
      "DATABASE_URL, E2E_AUTH_CLERK_ID, and E2E_AUTH_SECRET are required for authenticated E2E tests.",
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const user = await prisma.user.upsert({
      where: { clerkId },
      update: {
        email: "e2e-playwright-user@example.test",
        isGuest: false,
        guestConvertedAt: null,
        onboardingCompletedAt: new Date(),
      },
      create: {
        clerkId,
        email: "e2e-playwright-user@example.test",
        isGuest: false,
        onboardingCompletedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.preferences.upsert({
      where: { userId: user.id },
      update: { voiceEnabled: true },
      create: { userId: user.id, voiceEnabled: true },
    });

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: { status: "ACTIVE", planId: "BASIC" },
      create: { userId: user.id, status: "ACTIVE", planId: "BASIC" },
    });

    const noAccessUser = await prisma.user.upsert({
      where: { clerkId: E2E_ACCESS_USERS.noAccess.clerkId },
      update: {
        email: "e2e-no-access-user@example.test",
        isGuest: false,
        onboardingCompletedAt: new Date(),
      },
      create: {
        clerkId: E2E_ACCESS_USERS.noAccess.clerkId,
        email: "e2e-no-access-user@example.test",
        isGuest: false,
        onboardingCompletedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.subscription.deleteMany({
      where: { userId: noAccessUser.id },
    });
    await seedChat(prisma, {
      id: E2E_ACCESS_USERS.noAccess.chatId,
      userId: noAccessUser.id,
      title: "Cronologia senza piano",
      userMessage: "Il messaggio resta mio anche senza un piano.",
      assistantMessage: "La cronologia resta disponibile.",
    });

    await seedChat(prisma, {
      id: E2E_ACCESS_USERS.paid.chatId,
      userId: user.id,
      title: "Coaching con piano attivo",
      userMessage: "Questa conversazione ha accesso attivo.",
      assistantMessage: "Puoi continuare il coaching.",
    });

    const removedSeatUser = await prisma.user.upsert({
      where: { clerkId: E2E_ACCESS_USERS.removedSeat.clerkId },
      update: {
        email: "e2e-removed-seat-user@example.test",
        isGuest: false,
        onboardingCompletedAt: new Date(),
      },
      create: {
        clerkId: E2E_ACCESS_USERS.removedSeat.clerkId,
        email: "e2e-removed-seat-user@example.test",
        isGuest: false,
        onboardingCompletedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.subscription.deleteMany({
      where: { userId: removedSeatUser.id },
    });
    const organization = await prisma.organization.upsert({
      where: { clerkOrganizationId: "e2e-removed-seat-organization" },
      update: { createdByUserId: user.id, status: "ACTIVE" },
      create: {
        clerkOrganizationId: "e2e-removed-seat-organization",
        name: "Organizzazione E2E",
        slug: "e2e-removed-seat-organization",
        status: "ACTIVE",
        createdByUserId: user.id,
      },
      select: { id: true },
    });
    await prisma.organizationMembership.upsert({
      where: { clerkMembershipId: "e2e-removed-seat-membership" },
      update: {
        organizationId: organization.id,
        userId: removedSeatUser.id,
        status: "REMOVED",
        leftAt: new Date(),
      },
      create: {
        clerkMembershipId: "e2e-removed-seat-membership",
        organizationId: organization.id,
        userId: removedSeatUser.id,
        status: "REMOVED",
        leftAt: new Date(),
      },
    });
    await seedChat(prisma, {
      id: E2E_ACCESS_USERS.removedSeat.chatId,
      userId: removedSeatUser.id,
      title: "Cronologia dopo rimozione posto",
      userMessage: "Questa chat precede la rimozione del posto.",
      assistantMessage: "I dati restano accessibili al titolare.",
    });

    const onboardingUser = await prisma.user.upsert({
      where: { clerkId: E2E_ACCESS_USERS.onboarding.clerkId },
      update: {
        email: "e2e-onboarding-user@example.test",
        isGuest: false,
        onboardingCompletedAt: null,
      },
      create: {
        clerkId: E2E_ACCESS_USERS.onboarding.clerkId,
        email: "e2e-onboarding-user@example.test",
        isGuest: false,
        onboardingCompletedAt: null,
      },
      select: { id: true },
    });
    await prisma.onboardingSession.deleteMany({
      where: { userId: onboardingUser.id },
    });

    await prisma.routine.deleteMany({
      where: { userId: user.id, title: "Routine E2E ripetibile" },
    });
    await prisma.routine.create({
      data: {
        userId: user.id,
        title: "Routine E2E ripetibile",
        trigger: "Quando serve un reset prima del prossimo gesto",
        durationLabel: "60 secondi",
        steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
        completionCue: "Riparti con un gesto semplice",
        status: "ACTIVE",
        formatVersion: 1,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function seedChat(
  prisma: PrismaClient,
  input: {
    id: string;
    userId: string;
    title: string;
    userMessage: string;
    assistantMessage: string;
  },
) {
  await prisma.chat.upsert({
    where: { id: input.id },
    update: { userId: input.userId, title: input.title, deletedAt: null },
    create: { id: input.id, userId: input.userId, title: input.title },
  });
  await prisma.message.deleteMany({ where: { chatId: input.id } });
  await prisma.message.createMany({
    data: [
      {
        userId: input.userId,
        chatId: input.id,
        channel: "WEB",
        direction: "INBOUND",
        role: "USER",
        parts: [{ type: "text", text: input.userMessage }],
      },
      {
        userId: input.userId,
        chatId: input.id,
        channel: "WEB",
        direction: "OUTBOUND",
        role: "ASSISTANT",
        parts: [{ type: "text", text: input.assistantMessage }],
      },
    ],
  });
}

export async function warmGuestChatRoute(fetcher: typeof fetch = fetch) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";
  const response = await fetcher(new URL("/api/guest/chat", appUrl), {
    method: "GET",
  });
  if (response.status >= 500) {
    throw new Error(
      `Failed to warm the guest chat route (${response.status} ${response.statusText})`,
    );
  }
}

export default async function globalSetup() {
  assertEphemeralE2EBranch();
  await seedAuthenticatedE2EUser();
  // Next dev compiles route modules on first access. Compile the chat endpoint
  // before assertion timeouts start so E2E latency measures the flow itself.
  await warmGuestChatRoute();
}
