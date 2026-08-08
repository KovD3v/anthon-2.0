import "server-only";

import {
  type RoutineCardData,
  toRoutineCardData,
} from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";

export async function getActiveRoutineForReturn(
  userId: string,
): Promise<RoutineCardData | null> {
  const routine = await prisma.routine.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      attempts: { orderBy: { attemptedAt: "desc" }, take: 1 },
    },
  });

  return routine ? toRoutineCardData(routine) : null;
}
