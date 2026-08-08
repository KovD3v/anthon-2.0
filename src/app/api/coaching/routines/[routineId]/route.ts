import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  badRequest,
  forbidden,
  jsonOk,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";
import { toRoutineCardData } from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const routineLogger = createLogger("ai");
const archiveRoutineBodySchema = z
  .object({ status: z.literal("ARCHIVED") })
  .strict();
const routineInclude = {
  attempts: {
    orderBy: [{ attemptedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
};
type RouteContext = { params: Promise<{ routineId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Unauthorized");
    if (user.isGuest) return forbidden();
    const { routineId } = await params;
    const routine = await prisma.routine.findFirst({
      where: { id: routineId, userId: user.id },
      include: routineInclude,
    });
    if (!routine) return notFound();
    return jsonOk({ routine: toRoutineCardData(routine) });
  } catch (error) {
    routineLogger.error(
      "coaching.routine_read_failed",
      "Failed to read coaching routine",
      { error },
    );
    return serverError();
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Unauthorized");
    if (user.isGuest) return forbidden();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid request body");
    }
    const parsed = archiveRoutineBodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body");

    const { routineId } = await params;
    const result = await prisma.$transaction(async (tx) => {
      const ownerWhere = { id: routineId, userId: user.id };
      const existing = await tx.routine.findFirst({
        where: ownerWhere,
        include: routineInclude,
      });
      if (!existing) return { routine: null, transitioned: false };
      if (existing.status === "ARCHIVED") {
        return { routine: existing, transitioned: false };
      }

      const transition = await tx.routine.updateMany({
        where: { ...ownerWhere, status: "ACTIVE" },
        data: { status: parsed.data.status, archivedAt: new Date() },
      });
      const routine = await tx.routine.findFirst({
        where: ownerWhere,
        include: routineInclude,
      });
      return { routine, transitioned: transition.count === 1 };
    });

    if (!result.routine) return notFound();
    if (result.transitioned && result.routine.sourceChatId) {
      revalidateTag(`chat-${result.routine.sourceChatId}`, "max");
    }
    return jsonOk({ routine: toRoutineCardData(result.routine) });
  } catch (error) {
    routineLogger.error(
      "coaching.routine_archive_failed",
      "Failed to archive coaching routine",
      { error },
    );
    return serverError();
  }
}
