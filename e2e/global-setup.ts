import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

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
      },
      create: {
        clerkId,
        email: "e2e-playwright-user@example.test",
        isGuest: false,
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
