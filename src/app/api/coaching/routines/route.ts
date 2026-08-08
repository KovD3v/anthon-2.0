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
import { getActiveRoutineForReturn } from "@/lib/coaching/routine-return.server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const routineLogger = createLogger("ai");
const createRoutineBodySchema = z
  .object({
    sourceAssistantMessageId: z.string().cuid(),
    derivedFromRoutineId: z.string().cuid().optional(),
  })
  .strict();
const routineInclude = {
  attempts: {
    orderBy: [{ attemptedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
};
const collectionQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  cursor: z.string().min(1).optional(),
});
const routineCursorSchema = z
  .object({ updatedAt: z.iso.datetime(), id: z.string().min(1) })
  .strict();

function encodeRoutineCursor(updatedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: updatedAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeRoutineCursor(
  cursor: string,
): { updatedAt: Date; id: string } | null {
  try {
    const parsed = routineCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    const updatedAt = new Date(parsed.data.updatedAt);
    return Number.isNaN(updatedAt.getTime())
      ? null
      : { updatedAt, id: parsed.data.id };
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function GET(request?: Request) {
  try {
    const url = new URL(
      request?.url ?? "http://localhost/api/coaching/routines",
    );
    const mode = url.searchParams.get("mode");
    if (mode === "collection") {
      const parsedQuery = collectionQuerySchema.safeParse({
        status: url.searchParams.get("status") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      });
      if (!parsedQuery.success) return badRequest("Invalid collection query");

      const decodedCursor = parsedQuery.data.cursor
        ? decodeRoutineCursor(parsedQuery.data.cursor)
        : null;
      if (parsedQuery.data.cursor && !decodedCursor) {
        return badRequest("Invalid collection cursor");
      }

      const { user, error } = await getAuthUser();
      if (error || !user) return unauthorized(error || "Unauthorized");
      if (user.isGuest) return forbidden();

      const baseWhere = {
        userId: user.id,
        status: parsedQuery.data.status,
        OR: [
          { sourceChatId: null },
          {
            sourceChat: {
              is: { userId: user.id, visibility: "PRIVATE" as const },
            },
          },
        ],
      };
      const where = decodedCursor
        ? {
            ...baseWhere,
            AND: [
              {
                OR: [
                  { updatedAt: { lt: decodedCursor.updatedAt } },
                  {
                    updatedAt: decodedCursor.updatedAt,
                    id: { lt: decodedCursor.id },
                  },
                ],
              },
            ],
          }
        : baseWhere;
      const total = await prisma.routine.count({ where: baseWhere });
      const routines = await prisma.routine.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: parsedQuery.data.limit + 1,
        include: routineInclude,
      });
      const hasMore = routines.length > parsedQuery.data.limit;
      const visibleRoutines = hasMore
        ? routines.slice(0, parsedQuery.data.limit)
        : routines;
      const lastRoutine = visibleRoutines.at(-1);

      return jsonOk({
        routines: visibleRoutines.map(toRoutineCardData),
        total,
        nextCursor:
          hasMore && lastRoutine
            ? encodeRoutineCursor(lastRoutine.updatedAt, lastRoutine.id)
            : null,
      });
    }
    if (mode && mode !== "return") return badRequest("Invalid routine mode");

    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Unauthorized");
    if (user.isGuest) return forbidden();

    const routine = await getActiveRoutineForReturn(user.id);
    return jsonOk({ routine });
  } catch (error) {
    routineLogger.error(
      "coaching.active_routine_read_failed",
      "Failed to read active coaching routine",
      { error },
    );
    return serverError();
  }
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

    const { sourceAssistantMessageId, derivedFromRoutineId } = parsed.data;
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

    if (derivedFromRoutineId) {
      const sourceRoutine = await prisma.routine.findFirst({
        where: { id: derivedFromRoutineId, userId: user.id },
        select: { id: true },
      });
      if (!sourceRoutine) return notFound();
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
          derivedFromRoutineId: derivedFromRoutineId ?? null,
          title: proposal.title,
          trigger: proposal.trigger,
          durationLabel: proposal.durationLabel ?? null,
          formatVersion: "formatVersion" in proposal ? 2 : 1,
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
