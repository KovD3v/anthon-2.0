/**
 * Single Guest Chat API Routes
 *
 * GET /api/guest/chats/[id] - Get chat with messages
 * PATCH /api/guest/chats/[id] - Update chat title
 * DELETE /api/guest/chats/[id] - Delete chat
 */

import { revalidateTag } from "next/cache";
import { generateChatMetadata } from "@/lib/ai/chat-title";
import { getFeedbackReasonFromMetadata } from "@/lib/chat-feedback";
import type { ChatIcon } from "@/lib/chat-icons";
import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";
import { createLogger } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { deletePrivateVoiceBlobsForMessages } from "@/lib/voice/attachment-cleanup";

const guestLogger = createLogger("auth");

interface RouteParams {
  params: Promise<{ id: string }>;
}

// -----------------------------------------------------
// GET - Get chat with messages
// -----------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest(request);
    const { id } = await params;

    // Parse pagination parameters
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const rawLimit = url.searchParams.get("limit");
    let limit = 50;
    if (rawLimit !== null) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return Response.json(
          { error: "limit must be a positive integer" },
          { status: 400 },
        );
      }
      limit = Math.min(parsedLimit, 100);
    }

    // Fetch the chat (only owner can access - no public chats for guests)
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        icon: true,
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
        clientMessageId: true,
        sourceInboundMessage: {
          select: { clientMessageId: true },
        },
        role: true,
        parts: true,
        createdAt: true,
        feedback: true,
        metadata: true,
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
      icon: chat.icon,
      visibility: chat.visibility,
      isOwner: true,
      isGuest: true,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: messagesToReturn.map((m) => ({
        id: m.id,
        ...(m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}),
        ...(m.sourceInboundMessage?.clientMessageId
          ? { sourceClientMessageId: m.sourceInboundMessage.clientMessageId }
          : {}),
        role: m.role.toLowerCase(),
        content: getTextFromParts(m.parts),
        parts: m.parts,
        createdAt: m.createdAt.toISOString(),
        feedback: m.feedback,
        feedbackReason: getFeedbackReasonFromMetadata(m.metadata),
        attachments: [], // Guests don't have attachments
      })),
      pagination: {
        hasMore,
        nextCursor,
      },
      routines: [],
    });
  } catch (err) {
    guestLogger.error("get.error", "Failed to fetch guest chat", {
      error: err,
    });
    return Response.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// PATCH - Update chat title
// -----------------------------------------------------

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest(request);
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

    let body: Record<string, unknown>;
    try {
      const parsedBody = await request.json();
      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.title !== undefined && typeof body.title !== "string") {
      return Response.json(
        { error: "title must be a string" },
        { status: 400 },
      );
    }

    if (
      body.generateTitle !== undefined &&
      typeof body.generateTitle !== "boolean"
    ) {
      return Response.json(
        { error: "generateTitle must be a boolean" },
        { status: 400 },
      );
    }

    const title = body.title;
    const generateTitle = body.generateTitle;

    let newTitle = title;
    let newIcon: ChatIcon | undefined;

    // Auto-generate title if requested
    if (generateTitle && !title) {
      const firstUserMessage = await prisma.message.findFirst({
        where: { chatId: id, role: "USER" },
        orderBy: { createdAt: "asc" },
        select: { parts: true },
      });

      if (firstUserMessage) {
        const text = getTextFromParts(firstUserMessage.parts);
        if (text) {
          const generated = await generateChatMetadata(
            [{ role: "user", text }],
            text,
            { userId: user.id },
          );
          newTitle = generated.title;
          newIcon = generated.icon;
        }
      }
    }

    const updatedChat = await prisma.chat.update({
      where: { id },
      data: {
        ...(newTitle !== undefined && { title: newTitle }),
        ...(newIcon !== undefined && { icon: newIcon }),
        ...(title !== undefined && !generateTitle && { customTitle: true }),
        // Guests cannot change visibility
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        updatedAt: true,
      },
    });
    revalidateTag(`chat-${id}`, "max");
    revalidateTag(`chats-${user.id}`, "max");

    return Response.json({
      id: updatedChat.id,
      title: updatedChat.title ?? "Nuova Chat",
      icon: updatedChat.icon,
      visibility: updatedChat.visibility,
      updatedAt: updatedChat.updatedAt.toISOString(),
      isGuest: true,
    });
  } catch (err) {
    guestLogger.error("patch.error", "Failed to update guest chat", {
      error: err,
    });
    return Response.json({ error: "Failed to update chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// DELETE - Delete chat
// -----------------------------------------------------

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user } = await authenticateGuest(request);
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

    await deletePrivateVoiceBlobsForMessages({ chatId: id });

    // Delete chat (cascade will delete messages)
    await prisma.chat.delete({
      where: { id },
    });

    try {
      revalidateTag(`chats-${user.id}`, "max");
      revalidateTag(`chat-${id}`, "max");
    } catch (revalidateErr) {
      guestLogger.warn(
        "delete.revalidate_failed",
        "revalidateTag failed after DELETE",
        { error: revalidateErr },
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    guestLogger.error("delete.error", "Failed to delete guest chat", {
      error: err,
    });
    return Response.json({ error: "Failed to delete chat" }, { status: 500 });
  }
}
