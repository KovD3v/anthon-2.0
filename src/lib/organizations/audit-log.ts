/**
 * Organization Module — audit logging.
 */

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

type JsonObject = Record<string, unknown>;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function writeOrganizationAuditLog(input: {
  organizationId: string;
  actorUserId?: string | null;
  actorType: "ADMIN" | "SYSTEM" | "WEBHOOK";
  action:
    | "ORGANIZATION_CREATED"
    | "CONTRACT_UPDATED"
    | "OWNER_ASSIGNED"
    | "OWNER_TRANSFERRED"
    | "MEMBERSHIP_SYNCED"
    | "MEMBERSHIP_BLOCKED_SEAT_LIMIT";
  before?: JsonObject | null;
  after?: JsonObject | null;
  metadata?: JsonObject | null;
}): Promise<void> {
  await prisma.organizationAuditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      before: input.before ? jsonValue(input.before) : undefined,
      after: input.after ? jsonValue(input.after) : undefined,
      metadata: input.metadata ? jsonValue(input.metadata) : undefined,
    },
  });
}

export async function listOrganizationAuditLogs(
  organizationId: string,
  options?: { take?: number; skip?: number },
) {
  return prisma.organizationAuditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: options?.take,
    skip: options?.skip,
    include: {
      actorUser: {
        select: { id: true, email: true },
      },
    },
  });
}
