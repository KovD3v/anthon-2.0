import { z } from "zod";
import type { RecalledFact } from "@/lib/ai/memory-facts";
import { prisma } from "@/lib/db";

export const COACHING_MEMORY_CATEGORIES = [
  "identity",
  "sport",
  "goal",
  "preference",
  "health",
  "schedule",
  "other",
] as const;

const optionalProfileField = z
  .union([z.string().trim().max(500), z.null()])
  .transform((value) => (value === "" ? null : value));

export const coachingProfilePatchSchema = z
  .object({
    age: z.union([z.number().int().min(1).max(120), z.null()]).optional(),
    occupation: optionalProfileField.optional(),
    sport: optionalProfileField.optional(),
    goal: optionalProfileField.optional(),
    experience: optionalProfileField.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nessun campo da aggiornare",
  });

export const coachingMemoryPatchSchema = z
  .object({
    content: z.string().trim().min(1).max(1000),
    category: z.enum(COACHING_MEMORY_CATEGORIES),
  })
  .strict();

type StoredMemoryValue = {
  content?: unknown;
};

export function projectCoachingMemory(memory: {
  id: string;
  value: unknown;
  category: string;
  updatedAt: Date;
}) {
  const value = memory.value as StoredMemoryValue | null;
  if (!value || typeof value.content !== "string" || !value.content.trim()) {
    return null;
  }
  const category = COACHING_MEMORY_CATEGORIES.includes(
    memory.category as (typeof COACHING_MEMORY_CATEGORIES)[number],
  )
    ? (memory.category as (typeof COACHING_MEMORY_CATEGORIES)[number])
    : "other";

  return {
    id: memory.id,
    content: value.content.trim(),
    category,
    updatedAt: memory.updatedAt.toISOString(),
  };
}

export function projectCoachingFact(fact: RecalledFact) {
  const category = COACHING_MEMORY_CATEGORIES.includes(
    fact.category as (typeof COACHING_MEMORY_CATEGORIES)[number],
  )
    ? (fact.category as (typeof COACHING_MEMORY_CATEGORIES)[number])
    : "other";
  return {
    id: fact.id,
    content: fact.content,
    category,
    updatedAt: fact.updatedAt.toISOString(),
  };
}

export async function getUserControlledCoachingGoal(
  userId: string,
): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { goal: true },
  });
  return profile?.goal?.trim() || null;
}
