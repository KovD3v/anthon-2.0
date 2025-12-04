/**
 * Chats API Routes
 *
 * GET /api/chats - List all chats for the current user
 * POST /api/chats - Create a new chat
 */

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

// -----------------------------------------------------
// GET - List all chats for the current user
// -----------------------------------------------------

export async function GET() {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    const chats = await prisma.chat.findMany({
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
    });

    return Response.json({
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title ?? "New Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messageCount: chat._count.messages,
      })),
    });
  } catch (err) {
    console.error("[Chats API] GET error:", err);
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

    try {
      const body = await request.json();
      title = body.title;
      if (body.visibility === "PUBLIC" || body.visibility === "PRIVATE") {
        visibility = body.visibility;
      }
    } catch {
      // Empty body is fine - we'll create with defaults
    }

    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title,
        visibility,
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json(
      {
        id: chat.id,
        title: chat.title ?? "New Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Chats API] POST error:", err);
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
