/**
 * Single Chat API Routes
 *
 * GET /api/chats/[id] - Get chat with messages
 * PATCH /api/chats/[id] - Update chat (title, visibility)
 * DELETE /api/chats/[id] - Delete chat and all its messages
 */

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

export async function GET(_request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        OR: [
          { userId: user.id }, // Owner can always access
          { visibility: "PUBLIC" }, // Public chats are accessible to all
        ],
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
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
        },
      },
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    return Response.json({
      id: chat.id,
      title: chat.title ?? "New Chat",
      visibility: chat.visibility,
      isOwner: chat.userId === user.id,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: chat.messages.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        content: m.content,
        parts: m.parts,
        createdAt: m.createdAt.toISOString(),
        model: m.model,
        usage: m.inputTokens
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

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Chat API] DELETE error:", err);
    return Response.json({ error: "Failed to delete chat" }, { status: 500 });
  }
}
