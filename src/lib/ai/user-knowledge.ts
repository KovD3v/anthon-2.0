import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { invalidateUserContextPromptCache } from "./tools/user-context-cache";

const knowledgeLogger = createLogger("ai");

export type CanonicalProfilePatch = {
  name?: string | null;
  age?: number | null;
  occupation?: string | null;
  sport?: string | null;
  goal?: string | null;
  experience?: string | null;
  notes?: string | null;
};

export type CanonicalPreferencesPatch = {
  tone?: string;
  mode?: string;
  language?: string;
  push?: boolean;
};

function definedValues<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;
}

async function syncNameToClerk(userId: string, name: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { clerkId: true },
    });
    if (!user?.clerkId) return;

    const [firstName, ...lastNameParts] = name.split(" ");
    const client = await clerkClient();
    await client.users.updateUser(user.clerkId, {
      firstName,
      lastName: lastNameParts.join(" ") || undefined,
    });
  } catch (error) {
    knowledgeLogger.warn(
      "ai.knowledge.clerk_name_sync_failed",
      "Canonical profile was saved but Clerk name sync failed",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        userId,
      },
    );
  }
}

export async function updateCanonicalProfile(
  userId: string,
  patch: CanonicalProfilePatch,
) {
  const values = definedValues(patch);
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: values,
    create: { userId, ...values },
  });

  if (patch.name) await syncNameToClerk(userId, patch.name);
  invalidateUserContextPromptCache(userId);
  return profile;
}

export async function updateCanonicalPreferences(
  userId: string,
  patch: CanonicalPreferencesPatch,
) {
  const values = definedValues(patch);
  const preferences = await prisma.preferences.upsert({
    where: { userId },
    update: values,
    create: {
      userId,
      ...values,
      language: patch.language ?? "IT",
      push: patch.push ?? true,
    },
  });

  invalidateUserContextPromptCache(userId);
  return preferences;
}
