import { z } from "zod";
import { prisma } from "@/lib/db";

export const BETA_MAILING_CONSENT_VERSION = "privacy-2026-08-16";

const betaMailingInputSchema = z.object({
  email: z.string().trim().email(),
  releaseConsent: z.literal(true),
  updatesConsent: z.boolean(),
});

export type BetaMailingInput = z.input<typeof betaMailingInputSchema>;

export async function subscribeToBetaMailing(
  input: BetaMailingInput,
  now = new Date(),
): Promise<{ success: true }> {
  const parsed = betaMailingInputSchema.parse(input);
  const email = parsed.email.trim();
  const normalizedEmail = email.toLowerCase();

  await prisma.$transaction(async (tx) => {
    const subscriber = await tx.betaMailingSubscriber.upsert({
      where: { normalizedEmail },
      create: {
        email,
        normalizedEmail,
        releaseOptInAt: now,
        updatesOptInAt: parsed.updatesConsent ? now : null,
        updatesOptOutAt: null,
        consentVersion: BETA_MAILING_CONSENT_VERSION,
      },
      update: {
        email,
        releaseOptInAt: now,
        consentVersion: BETA_MAILING_CONSENT_VERSION,
      },
      select: {
        id: true,
        updatesOptInAt: true,
        updatesOptOutAt: true,
      },
    });

    if (parsed.updatesConsent) {
      await tx.betaMailingSubscriber.update({
        where: { id: subscriber.id },
        data: { updatesOptInAt: now, updatesOptOutAt: null },
        select: { id: true },
      });
    } else if (subscriber.updatesOptInAt && !subscriber.updatesOptOutAt) {
      await tx.betaMailingSubscriber.update({
        where: { id: subscriber.id },
        data: { updatesOptOutAt: now },
        select: { id: true },
      });
    }
  });

  return { success: true };
}

export async function listBetaSubscribers(input: {
  page: number;
  limit: number;
  updatesOnly: boolean;
}) {
  const page = Math.max(1, Math.trunc(input.page));
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit)));
  const activeUpdatesWhere = {
    updatesOptInAt: { not: null },
    updatesOptOutAt: null,
  } as const;
  const where = input.updatesOnly ? activeUpdatesWhere : {};

  const [subscribers, total, totalSubscribers, updatesSubscribers] =
    await Promise.all([
      prisma.betaMailingSubscriber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          releaseOptInAt: true,
          updatesOptInAt: true,
          updatesOptOutAt: true,
          consentVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.betaMailingSubscriber.count({ where }),
      prisma.betaMailingSubscriber.count(),
      prisma.betaMailingSubscriber.count({ where: activeUpdatesWhere }),
    ]);

  return {
    subscribers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    metrics: { total: totalSubscribers, updates: updatesSubscribers },
  };
}

export async function getBetaSubscribersForExport() {
  return prisma.betaMailingSubscriber.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      email: true,
      releaseOptInAt: true,
      updatesOptInAt: true,
      updatesOptOutAt: true,
      consentVersion: true,
      createdAt: true,
    },
  });
}
