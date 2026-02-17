/**
 * Organization Module — audit logging.
 */

import { prisma } from "@/lib/db";

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
