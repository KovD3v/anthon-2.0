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

const attemptLogger = createLogger("ai");
const outcomeBodySchema = z
  .object({
    outcome: z.enum(["HELPFUL", "PARTIALLY_HELPFUL", "NOT_HELPFUL"]),
    outcomeNote: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
const routineInclude = {
  attempts: {
    orderBy: [{ attemptedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
};
type RouteContext = { params: Promise<{ attemptId: string }> };

class RoutineInactiveError extends Error {}

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
    const parsed = outcomeBodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body");

    const { attemptId } = await params;
    const attempt = await prisma.routineAttempt.findFirst({
      where: {
        id: attemptId,
        routine: { userId: user.id, status: "ACTIVE" },
      },
      select: { id: true, routineId: true },
    });
    if (!attempt) return notFound();

    const now = new Date();
    const persistOutcome = () =>
      prisma.$transaction(async (tx) => {
        const activeRoutine = await tx.routine.updateMany({
          where: {
            id: attempt.routineId,
            userId: user.id,
            status: "ACTIVE",
          },
          data: { updatedAt: now },
        });
        if (activeRoutine.count !== 1) throw new RoutineInactiveError();

        await tx.routineAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: parsed.data.outcome,
            outcomeNote: parsed.data.outcomeNote,
            outcomeRecordedAt: now,
          },
          select: { id: true },
        });
        const activeRecord = await tx.routine.findFirst({
          where: {
            id: attempt.routineId,
            userId: user.id,
            status: "ACTIVE",
          },
          include: routineInclude,
        });
        if (!activeRecord) throw new RoutineInactiveError();
        return activeRecord;
      });
    let routine: Awaited<ReturnType<typeof persistOutcome>>;
    try {
      routine = await persistOutcome();
    } catch (error) {
      if (error instanceof RoutineInactiveError) {
        return Response.json({ error: "Routine is archived" }, { status: 409 });
      }
      throw error;
    }

    if (routine.sourceChatId) {
      revalidateTag(`chat-${routine.sourceChatId}`, "max");
    }
    return jsonOk({ routine: toRoutineCardData(routine) });
  } catch (error) {
    attemptLogger.error(
      "coaching.attempt_update_failed",
      "Failed to update coaching routine attempt",
      { error },
    );
    return serverError();
  }
}
