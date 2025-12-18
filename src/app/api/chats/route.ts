/**
 * Chats API Routes
 *
 * GET /api/chats - List all chats for the current user
 * POST /api/chats - Create a new chat
 */

import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  clearGuestCookie,
  getGuestTokenFromCookies,
  hashGuestToken,
} from "@/lib/guest-auth";
import { migrateGuestToUser } from "@/lib/guest-migration";

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
    // Check for guest migration: if user has a guest cookie, migrate their data
    const guestToken = await getGuestTokenFromCookies();
    if (guestToken) {
      const tokenHash = hashGuestToken(guestToken);

      // Find guest user by token hash
      const guestUser = await prisma.user.findFirst({
        where: {
          isGuest: true,
          guestAbuseIdHash: tokenHash,
          guestConvertedAt: null,
        },
        select: { id: true },
      });

      if (guestUser && guestUser.id !== user.id) {
        // Migrate guest data to authenticated user
        console.log(
          `[Chats API] Migrating guest ${guestUser.id} to user ${user.id}`,
        );
        const migrationResult = await migrateGuestToUser(guestUser.id, user.id);

        if (migrationResult.success) {
          console.log(
            `[Chats API] Migration successful:`,
            migrationResult.migratedCounts,
          );
        } else {
          console.error(`[Chats API] Migration failed:`, migrationResult.error);
        }

        // Clear guest cookie after migration attempt
        await clearGuestCookie();
      }
    }

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
      { status: 201 },
    );
  } catch (err) {
    console.error("[Chats API] POST error:", err);
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
