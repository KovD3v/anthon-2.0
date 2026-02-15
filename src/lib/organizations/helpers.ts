/**
 * Organization Module — pure utility helpers.
 */

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import {
  isOrganizationBasePlan,
  normalizeOrganizationBasePlan,
} from "@/lib/organizations/plan-defaults";
import {
  ORGANIZATION_MODEL_TIERS,
  type OrganizationContractInput,
  type OrganizationMemberRole,
} from "@/lib/organizations/types";

type JsonObject = Record<string, unknown>;

export type { JsonObject };

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function sanitizeContractInput(
  input: OrganizationContractInput,
): OrganizationContractInput {
  if (!isOrganizationBasePlan(input.basePlan)) {
    throw new Error("Invalid basePlan");
  }

  if (!ORGANIZATION_MODEL_TIERS.includes(input.modelTier)) {
    throw new Error("Invalid modelTier");
  }

  const planLabel = input.planLabel.trim();
  if (!planLabel) {
    throw new Error("planLabel is required");
  }

  const seatLimit = Number(input.seatLimit);
  const maxRequestsPerDay = Number(input.maxRequestsPerDay);
  const maxInputTokensPerDay = Number(input.maxInputTokensPerDay);
  const maxOutputTokensPerDay = Number(input.maxOutputTokensPerDay);
  const maxCostPerDay = Number(input.maxCostPerDay);
  const maxContextMessages = Number(input.maxContextMessages);

  if (!Number.isFinite(seatLimit) || seatLimit < 1) {
    throw new Error("seatLimit must be >= 1");
  }
  if (!Number.isFinite(maxRequestsPerDay) || maxRequestsPerDay < 1) {
    throw new Error("maxRequestsPerDay must be >= 1");
  }
  if (!Number.isFinite(maxInputTokensPerDay) || maxInputTokensPerDay < 1) {
    throw new Error("maxInputTokensPerDay must be >= 1");
  }
  if (!Number.isFinite(maxOutputTokensPerDay) || maxOutputTokensPerDay < 1) {
    throw new Error("maxOutputTokensPerDay must be >= 1");
  }
  if (!Number.isFinite(maxCostPerDay) || maxCostPerDay < 0) {
    throw new Error("maxCostPerDay must be >= 0");
  }
  if (!Number.isFinite(maxContextMessages) || maxContextMessages < 1) {
    throw new Error("maxContextMessages must be >= 1");
  }

  return {
    basePlan: normalizeOrganizationBasePlan(input.basePlan),
    planLabel,
    modelTier: input.modelTier,
    seatLimit: Math.floor(seatLimit),
    maxRequestsPerDay: Math.floor(maxRequestsPerDay),
    maxInputTokensPerDay: Math.floor(maxInputTokensPerDay),
    maxOutputTokensPerDay: Math.floor(maxOutputTokensPerDay),
    maxCostPerDay,
    maxContextMessages: Math.floor(maxContextMessages),
  };
}

export function isSerializationFailure(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

export function getRoleFromClerkMembership(
  role: string | null,
): OrganizationMemberRole {
  if (!role) return "MEMBER";
  const normalized = role.toLowerCase();
  if (normalized.includes("admin") || normalized.includes("owner")) {
    return "OWNER";
  }
  return "MEMBER";
}

export async function ensureUniqueSlug(
  baseSlug: string,
  options?: { excludeOrganizationId?: string },
): Promise<string> {
  const rootSlug = baseSlug || `org-${Date.now()}`;
  let nextSlug = rootSlug;
  let suffix = 1;
  const maxAttempts = 100;

  while (suffix <= maxAttempts) {
    const exists = await prisma.organization.findUnique({
      where: { slug: nextSlug },
      select: { id: true },
    });
    if (!exists || exists.id === options?.excludeOrganizationId) {
      return nextSlug;
    }
    suffix += 1;
    nextSlug = `${rootSlug}-${suffix}`;
  }

  throw new Error("Unable to generate unique organization slug");
}

export async function resolveOwnerByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      clerkId: true,
      email: true,
    },
  });
}
