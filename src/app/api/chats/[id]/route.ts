/**
 * Single Chat API Routes
 *
 * GET /api/chats/[id] - Get chat with messages
 * PATCH /api/chats/[id] - Update chat (title, visibility)
 * DELETE /api/chats/[id] - Delete chat and all its messages
 */

import { revalidateTag } from "next/cache";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// -----------------------------------------------------
// GET - Get chat with messages
// -----------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Parse pagination parameters
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // Message ID to fetch before
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1),
    100,
  ); // Clamp between 1-100

  try {
    // First fetch the chat to verify access
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        OR: [
          { userId: user.id }, // Owner can always access
          { visibility: "PUBLIC" }, // Public chats are accessible to all
        ],
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    // Fetch messages with cursor-based pagination
    // Fetch newest first, then reverse for chronological display
    const messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "desc" }, // Newest first
      take: limit + 1, // Extra to check for hasMore
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor message itself
      }),
      select: {
        id: true,
        role: true,
        content: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
        reasoningTimeMs: true,
        ragUsed: true,
        toolCalls: true,
        attachments: {
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        },
      },
    });

    // Determine if more messages exist
    const hasMore = messages.length > limit;
    const messagesToReturn = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore
      ? messagesToReturn[messagesToReturn.length - 1]?.id
      : null;

    // Reverse to chronological order for display
    messagesToReturn.reverse();

    return Response.json({
      id: chat.id,
      title: chat.title ?? "New Chat",
      visibility: chat.visibility,
      isOwner: chat.userId === user.id,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: messagesToReturn.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        content: m.content,
        parts: m.parts,
        createdAt: m.createdAt.toISOString(),
        model: m.model,
        usage:
          m.inputTokens !== null
            ? {
                inputTokens: m.inputTokens,
                outputTokens: m.outputTokens,
                cost: m.costUsd,
                generationTimeMs: m.generationTimeMs,
                reasoningTimeMs: m.reasoningTimeMs,
              }
            : undefined,
        ragUsed: m.ragUsed,
        toolCalls: m.toolCalls,
        attachments: m.attachments,
      })),
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    console.error("[Chat API] GET error:", err);
    return Response.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// PATCH - Update chat (title, visibility)
// -----------------------------------------------------

export async function PATCH(request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const chat = await prisma.chat.findFirst({
      where: { id, userId: user.id },
    });

    if (!chat) {
      return Response.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { title, visibility, generateTitle } = body as {
      title?: string;
      visibility?: "PRIVATE" | "PUBLIC";
      generateTitle?: boolean;
    };

    let newTitle = title;

    // Auto-generate title from first message if requested
    if (generateTitle && !title) {
      const firstUserMessage = await prisma.message.findFirst({
        where: { chatId: id, role: "USER" },
        orderBy: { createdAt: "asc" },
        select: { content: true },
      });

      if (firstUserMessage?.content) {
        newTitle = await generateChatTitle(firstUserMessage.content);
      }
    }

    const updatedChat = await prisma.chat.update({
      where: { id },
      data: {
        ...(newTitle !== undefined && { title: newTitle }),
        ...(visibility && { visibility }),
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });

    revalidateTag(`chat-${id}`, "page");
    revalidateTag(`chats-${user.id}`, "page");

    return Response.json({
      id: updatedChat.id,
      title: updatedChat.title ?? "New Chat",
      visibility: updatedChat.visibility,
      updatedAt: updatedChat.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[Chat API] PATCH error:", err);
    return Response.json({ error: "Failed to update chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// DELETE - Delete chat and all its messages
// -----------------------------------------------------

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const chat = await prisma.chat.findFirst({
      where: { id, userId: user.id },
    });

    if (!chat) {
      return Response.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    // Delete chat (cascade will delete messages, artifacts, etc.)
    await prisma.chat.delete({
      where: { id },
    });

    revalidateTag(`chats-${user.id}`, "page");
    revalidateTag(`chat-${id}`, "page");

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Chat API] DELETE error:", err);
    return Response.json({ error: "Failed to delete chat" }, { status: 500 });
  }
}
