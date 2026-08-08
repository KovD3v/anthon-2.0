import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  badRequest,
  forbidden,
  jsonCreated,
  jsonOk,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";
import {
  getRoutineProposalFromParts,
  toRoutineCardData,
} from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const routineLogger = createLogger("ai");
const createRoutineBodySchema = z
  .object({ sourceAssistantMessageId: z.string().cuid() })
  .strict();
const routineInclude = {
  attempts: {
    orderBy: [{ attemptedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(request: Request) {
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
    const parsed = createRoutineBodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body");

    const { sourceAssistantMessageId } = parsed.data;
    const message = await prisma.message.findFirst({
      where: {
        id: sourceAssistantMessageId,
        userId: user.id,
        role: "ASSISTANT",
        chat: { is: { userId: user.id, visibility: "PRIVATE" } },
      },
      select: { chatId: true, parts: true },
    });
    if (!message) return notFound();

    const proposal = getRoutineProposalFromParts(message.parts);
    if (!proposal) {
      return Response.json(
        { error: "Validated routine proposal not found" },
        { status: 422 },
      );
    }

    const uniqueWhere = {
      userId_sourceAssistantMessageId: {
        userId: user.id,
        sourceAssistantMessageId,
      },
    };
    const existing = await prisma.routine.findUnique({
      where: uniqueWhere,
      include: routineInclude,
    });
    if (existing) {
      return jsonOk({ routine: toRoutineCardData(existing) });
    }

    const persistRoutine = () =>
      prisma.routine.upsert({
        where: uniqueWhere,
        update: {},
        create: {
          userId: user.id,
          sourceChatId: message.chatId,
          sourceAssistantMessageId,
          title: proposal.title,
          trigger: proposal.trigger,
          durationLabel: proposal.durationLabel ?? null,
          steps: proposal.steps,
          completionCue: proposal.completionCue,
        },
        include: routineInclude,
      });
    let routine: Awaited<ReturnType<typeof persistRoutine>>;
    try {
      routine = await persistRoutine();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrentRoutine = await prisma.routine.findUnique({
        where: uniqueWhere,
        include: routineInclude,
      });
      if (!concurrentRoutine) throw error;
      return jsonOk({ routine: toRoutineCardData(concurrentRoutine) });
    }

    revalidateTag(`chat-${message.chatId}`, "max");
    return jsonCreated({ routine: toRoutineCardData(routine) });
  } catch (error) {
    routineLogger.error(
      "coaching.routine_create_failed",
      "Failed to create coaching routine",
      { error },
    );
    return serverError();
  }
}
