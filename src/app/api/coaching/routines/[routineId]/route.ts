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
    const ownedRoutine = await prisma.routine.findFirst({
      where: { id: routineId, userId: user.id },
      select: { id: true },
    });
    if (!ownedRoutine) return notFound();

    const routine = await prisma.routine.update({
      where: { id: ownedRoutine.id },
      data: { status: parsed.data.status, archivedAt: new Date() },
      include: routineInclude,
    });

    if (routine.sourceChatId) {
      revalidateTag(`chat-${routine.sourceChatId}`, "max");
    }
    return jsonOk({ routine: toRoutineCardData(routine) });
  } catch (error) {
    routineLogger.error(
      "coaching.routine_archive_failed",
      "Failed to archive coaching routine",
      { error },
    );
    return serverError();
  }
}
