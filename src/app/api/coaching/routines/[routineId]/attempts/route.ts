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
import { toRoutineCardData } from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const attemptLogger = createLogger("ai");
const attemptBodySchema = z
  .object({
    clientActionId: z.string().uuid(),
    outcome: z.enum(["HELPFUL", "PARTIALLY_HELPFUL", "NOT_HELPFUL"]).optional(),
    outcomeNote: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
const attemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  cursor: z.string().min(1).optional(),
});
const attemptCursorSchema = z
  .object({ attemptedAt: z.iso.datetime(), id: z.string().min(1) })
  .strict();
const routineInclude = {
  attempts: {
    orderBy: [{ attemptedAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
};
type RouteContext = { params: Promise<{ routineId: string }> };

class RoutineInactiveError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function encodeAttemptCursor(attemptedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ attemptedAt: attemptedAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeAttemptCursor(
  cursor: string,
): { attemptedAt: Date; id: string } | null {
  try {
    const parsed = attemptCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    const attemptedAt = new Date(parsed.data.attemptedAt);
    return Number.isNaN(attemptedAt.getTime())
      ? null
      : { attemptedAt, id: parsed.data.id };
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const parsedQuery = attemptsQuerySchema.safeParse({
      limit: new URL(request.url).searchParams.get("limit") ?? undefined,
      cursor: new URL(request.url).searchParams.get("cursor") ?? undefined,
    });
    if (!parsedQuery.success) return badRequest("Invalid attempts query");
    const cursor = parsedQuery.data.cursor
      ? decodeAttemptCursor(parsedQuery.data.cursor)
      : null;
    if (parsedQuery.data.cursor && !cursor) {
      return badRequest("Invalid attempts cursor");
    }

    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Unauthorized");
    if (user.isGuest) return forbidden();

    const { routineId } = await params;
    const routine = await prisma.routine.findFirst({
      where: { id: routineId, userId: user.id },
      select: { id: true },
    });
    if (!routine) return notFound();

    const attempts = await prisma.routineAttempt.findMany({
      where: cursor
        ? {
            routineId,
            OR: [
              { attemptedAt: { lt: cursor.attemptedAt } },
              { attemptedAt: cursor.attemptedAt, id: { lt: cursor.id } },
            ],
          }
        : { routineId },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
      take: parsedQuery.data.limit + 1,
      select: {
        id: true,
        attemptedAt: true,
        outcome: true,
        outcomeNote: true,
        outcomeRecordedAt: true,
      },
    });
    const hasMore = attempts.length > parsedQuery.data.limit;
    const visibleAttempts = hasMore
      ? attempts.slice(0, parsedQuery.data.limit)
      : attempts;
    const lastAttempt = visibleAttempts.at(-1);

    return jsonOk({
      attempts: visibleAttempts,
      nextCursor:
        hasMore && lastAttempt
          ? encodeAttemptCursor(lastAttempt.attemptedAt, lastAttempt.id)
          : null,
    });
  } catch (error) {
    attemptLogger.error(
      "coaching.attempt_history_read_failed",
      "Failed to read coaching routine attempts",
      { error },
    );
    return serverError();
  }
}

export async function POST(request: Request, { params }: RouteContext) {
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
    const parsed = attemptBodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body");

    const { routineId } = await params;
    const ownedRoutine = await prisma.routine.findFirst({
      where: { id: routineId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!ownedRoutine) return notFound();
    if (ownedRoutine.status !== "ACTIVE") {
      return Response.json({ error: "Routine is archived" }, { status: 409 });
    }

    const routineWhere = {
      id: routineId,
      userId: user.id,
      status: "ACTIVE" as const,
    };
    const attemptWhere = {
      routineId_clientActionId: {
        routineId,
        clientActionId: parsed.data.clientActionId,
      },
    };

    let result: {
      routine: Awaited<ReturnType<typeof loadActiveRoutine>>;
      created: boolean;
    };
    try {
      result = await prisma.$transaction(async (tx) => {
        const existingAttempt = await tx.routineAttempt.findUnique({
          where: attemptWhere,
          select: { id: true },
        });
        if (existingAttempt) {
          const routine = await tx.routine.findFirst({
            where: routineWhere,
            include: routineInclude,
          });
          return { routine, created: false };
        }

        const now = new Date();
        const activeRoutine = await tx.routine.updateMany({
          where: routineWhere,
          data: { updatedAt: now },
        });
        if (activeRoutine.count !== 1) throw new RoutineInactiveError();

        await tx.routineAttempt.create({
          data: {
            routineId,
            clientActionId: parsed.data.clientActionId,
            outcome: parsed.data.outcome,
            outcomeNote: parsed.data.outcomeNote,
            outcomeRecordedAt: parsed.data.outcome ? now : null,
          },
          select: { id: true },
        });
        const routine = await tx.routine.findFirst({
          where: routineWhere,
          include: routineInclude,
        });
        if (!routine) throw new RoutineInactiveError();
        return { routine, created: true };
      });
    } catch (error) {
      if (error instanceof RoutineInactiveError) {
        return Response.json({ error: "Routine is archived" }, { status: 409 });
      }
      if (!isUniqueViolation(error)) throw error;

      const concurrentAttempt = await prisma.routineAttempt.findUnique({
        where: attemptWhere,
        select: { id: true },
      });
      if (!concurrentAttempt) throw error;
      result = {
        routine: await loadActiveRoutine(routineWhere),
        created: false,
      };
    }

    if (!result.routine) {
      return Response.json({ error: "Routine is archived" }, { status: 409 });
    }
    if (result.created && result.routine.sourceChatId) {
      revalidateTag(`chat-${result.routine.sourceChatId}`, "max");
    }
    const payload = { routine: toRoutineCardData(result.routine) };
    return result.created ? jsonCreated(payload) : jsonOk(payload);
  } catch (error) {
    attemptLogger.error(
      "coaching.attempt_create_failed",
      "Failed to create coaching routine attempt",
      { error },
    );
    return serverError();
  }
}

function loadActiveRoutine(where: {
  id: string;
  userId: string;
  status: "ACTIVE";
}) {
  return prisma.routine.findFirst({ where, include: routineInclude });
}
