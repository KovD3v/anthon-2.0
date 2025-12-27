/**
 * Guest Chats API Routes
 *
 * GET /api/guest/chats - List all chats for guest user
 * POST /api/guest/chats - Create a new chat for guest user
 */

import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";

export const runtime = "nodejs";

// -----------------------------------------------------
// GET - List all chats for guest user
// -----------------------------------------------------

export async function GET() {
  try {
    const { user } = await authenticateGuest();

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
        title: chat.title ?? "Nuova Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messageCount: chat._count.messages,
      })),
      isGuest: true,
    });
  } catch (err) {
    console.error("[Guest Chats API] GET error:", err);
    return Response.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}

// -----------------------------------------------------
// POST - Create a new chat for guest user
// -----------------------------------------------------

export async function POST(request: Request) {
  try {
    const { user } = await authenticateGuest();

    // Optional: parse body for initial title
    let title: string | undefined;

    try {
      const body = await request.json();
      title = body.title;
    } catch {
      // Empty body is fine
    }

    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title,
        customTitle: !!title,
        visibility: "PRIVATE", // Guests always have private chats
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
        title: chat.title ?? "Nuova Chat",
        visibility: chat.visibility,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        isGuest: true,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Guest Chats API] POST error:", err);
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
