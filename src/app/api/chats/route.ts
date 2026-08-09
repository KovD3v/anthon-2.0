/**
 * Chats API Routes
 *
 * GET /api/chats - List all chats for the current user
 * POST /api/chats - Create a new chat
 */

import { revalidateTag } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { convertGuestForAuthenticatedUser } from "@/lib/guest-conversion";
import { createLogger } from "@/lib/logger";

const chatsLogger = createLogger("ai");

// -----------------------------------------------------
// GET - List all chats for the current user
// -----------------------------------------------------

export async function GET() {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    await convertGuestForAuthenticatedUser(user.id);

    const chats = await prisma.chat.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    return Response.json({
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title ?? "Nuova Chat",
        icon: chat.icon,
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messageCount: chat._count.messages,
      })),
    });
  } catch (err) {
    chatsLogger.error("get.error", "Failed to fetch chats", { error: err });
    return Response.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}

// -----------------------------------------------------
// POST - Create a new chat
// -----------------------------------------------------

export async function POST(request: Request) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    // Optional: parse body for initial title or visibility
    let title: string | undefined;
    let visibility: "PRIVATE" | "PUBLIC" = "PRIVATE";
    let routineContext:
      | { routineId: string; mode: "repeat" | "adapt" }
      | undefined;

    try {
      const body = await request.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const rawBody = body as Record<string, unknown>;
        if (rawBody.title !== undefined && typeof rawBody.title !== "string") {
          return Response.json(
            { error: "title must be a string" },
            { status: 400 },
          );
        }

        title = rawBody.title;
        if (
          rawBody.visibility === "PUBLIC" ||
          rawBody.visibility === "PRIVATE"
        ) {
          visibility = rawBody.visibility;
        }

        if (rawBody.routineContext !== undefined) {
          if (
            !rawBody.routineContext ||
            typeof rawBody.routineContext !== "object" ||
            Array.isArray(rawBody.routineContext)
          ) {
            return Response.json(
              { error: "routineContext must be an object" },
              { status: 400 },
            );
          }

          const context = rawBody.routineContext as Record<string, unknown>;
          if (
            typeof context.routineId !== "string" ||
            context.routineId.trim() === "" ||
            (context.mode !== "repeat" && context.mode !== "adapt")
          ) {
            return Response.json(
              { error: "routineContext is invalid" },
              { status: 400 },
            );
          }

          const routine = await prisma.routine.findFirst({
            where: { id: context.routineId, userId: user.id },
            select: { id: true },
          });
          if (!routine) {
            return Response.json(
              { error: "Routine not found" },
              { status: 404 },
            );
          }

          routineContext = {
            routineId: context.routineId,
            mode: context.mode,
          };
        }
      }
    } catch {
      // Empty body is fine - we'll create with defaults
    }

    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title,
        customTitle: !!title,
        visibility,
        ...(routineContext
          ? {
              routineContextRoutineId: routineContext.routineId,
              routineContextMode:
                routineContext.mode === "repeat" ? "REPEAT" : "ADAPT",
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    revalidateTag(`chats-${user.id}`, "max");

    return Response.json(
      {
        id: chat.id,
        title: chat.title ?? "Nuova Chat",
        icon: chat.icon,
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    chatsLogger.error("post.error", "Failed to create chat", { error: err });
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
