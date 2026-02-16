/**
 * Single Guest Chat API Routes
 *
 * GET /api/guest/chats/[id] - Get chat with messages
 * PATCH /api/guest/chats/[id] - Update chat title
 * DELETE /api/guest/chats/[id] - Delete chat
 */

import { revalidateTag } from "next/cache";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// -----------------------------------------------------
// GET - Get chat with messages
// -----------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest();
    const { id } = await params;

    // Parse pagination parameters
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1),
      100,
    );

    // Fetch the chat (only owner can access - no public chats for guests)
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        userId: user.id,
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
    const messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
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
        ragUsed: true,
        toolCalls: true,
        // No attachments for guests
      },
    });

    const hasMore = messages.length > limit;
    const messagesToReturn = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore
      ? messagesToReturn[messagesToReturn.length - 1]?.id
      : null;

    messagesToReturn.reverse();

    return Response.json({
      id: chat.id,
      title: chat.title ?? "Nuova Chat",
      visibility: chat.visibility,
      isOwner: true,
      isGuest: true,
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
              }
            : undefined,
        ragUsed: m.ragUsed,
        toolCalls: m.toolCalls,
        attachments: [], // Guests don't have attachments
      })),
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    console.error("[Guest Chat API] GET error:", err);
    return Response.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// PATCH - Update chat title
// -----------------------------------------------------

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest();
    const { id } = await params;

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
    const { title, generateTitle } = body as {
      title?: string;
      generateTitle?: boolean;
    };

    let newTitle = title;

    // Auto-generate title if requested
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
        // Guests cannot change visibility
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
      title: updatedChat.title ?? "Nuova Chat",
      visibility: updatedChat.visibility,
      updatedAt: updatedChat.updatedAt.toISOString(),
      isGuest: true,
    });
  } catch (err) {
    console.error("[Guest Chat API] PATCH error:", err);
    return Response.json({ error: "Failed to update chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// DELETE - Delete chat
// -----------------------------------------------------

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest();
    const { id } = await params;

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

    // Delete chat (cascade will delete messages)
    await prisma.chat.delete({
      where: { id },
    });

    try {
      revalidateTag(`chats-${user.id}`, "page");
      revalidateTag(`chat-${id}`, "page");
    } catch (revalidateErr) {
      console.warn("[Guest Chat API] revalidateTag failed after DELETE:", revalidateErr);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Guest Chat API] DELETE error:", err);
    return Response.json({ error: "Failed to delete chat" }, { status: 500 });
  }
}
