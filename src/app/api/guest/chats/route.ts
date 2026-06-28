/**
 * Guest Chats API Routes
 *
 * GET /api/guest/chats - List all chats for guest user
 * POST /api/guest/chats - Create a new chat for guest user
 */

import { prisma } from "@/lib/db";
import { authenticateGuest, createGuestChatForSession } from "@/lib/guest-auth";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";

const guestLogger = createLogger("auth");

export const runtime = "nodejs";

// -----------------------------------------------------
// GET - List all chats for guest user
// -----------------------------------------------------

export async function GET() {
  try {
    const { user } = await LatencyLogger.measure(
      "Guest Chats: Authenticate guest",
      () => authenticateGuest(),
    );

    const chats = await LatencyLogger.measure(
      "Guest Chats: List chat rows",
      () =>
        prisma.chat.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            visibility: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { messages: true },
            },
          },
        }),
    );

    return Response.json({
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title ?? "Nuova Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messageCount: chat._count.messages,
      })),
      isGuest: true,
    });
  } catch (err) {
    guestLogger.error("get.error", "Failed to fetch guest chats", {
      error: err,
    });
    return Response.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}

// -----------------------------------------------------
// POST - Create a new chat for guest user
// -----------------------------------------------------

export async function POST(request: Request) {
  try {
    // Optional: parse body for initial title
    let title: string | undefined;

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
      }
    } catch {
      // Empty body is fine
    }

    const { chat } = await createGuestChatForSession({ title });

    return Response.json(
      {
        id: chat.id,
        title: chat.title ?? "Nuova Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        isGuest: true,
      },
      { status: 201 },
    );
  } catch (err) {
    guestLogger.error("post.error", "Failed to create guest chat", {
      error: err,
    });
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
