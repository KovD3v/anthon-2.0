import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { deletePrivateVoiceBlobsForMessages } from "@/lib/voice/attachment-cleanup";

const chatLogger = createLogger("ai");

function chatMessageSuffixWhere(
  userId: string,
  chatId: string | null,
  message: { id: string; createdAt: Date },
): Prisma.MessageWhereInput {
  return {
    userId,
    chatId,
    OR: [
      { createdAt: { gt: message.createdAt } },
      { createdAt: message.createdAt, id: { gte: message.id } },
    ],
  };
}

/**
 * GET /api/chat/messages?chatId=<chatId>
 * Returns the chat history for a specific chat.
 */
export async function GET(request: Request) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get chatId from query params
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    // Get internal user
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      // No user yet, return empty messages
      return NextResponse.json({ messages: [] });
    }

    // Build query based on whether chatId is provided
    const whereClause = chatId
      ? {
          userId: user.id,
          chatId,
        }
      : {
          userId: user.id,
          channel: "WEB" as const,
          type: "TEXT" as const,
        };

    // Select the newest window deterministically, then return it chronologically.
    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        role: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
      },
    });

    const chronologicalMessages = [...messages].sort((first, second) => {
      const createdAtDifference =
        first.createdAt.getTime() - second.createdAt.getTime();

      return createdAtDifference || first.id.localeCompare(second.id);
    });

    // Convert to UI message format
    const uiMessages = chronologicalMessages.map((msg) => ({
      id: msg.id,
      role: msg.role === "USER" ? "user" : "assistant",
      content: getTextFromParts(msg.parts) || "",
      parts: msg.parts,
      createdAt: msg.createdAt.toISOString(),
      model: msg.model,
      usage:
        msg.inputTokens !== null
          ? {
              inputTokens: msg.inputTokens,
              outputTokens: msg.outputTokens,
              cost: msg.costUsd,
              generationTimeMs: msg.generationTimeMs,
            }
          : undefined,
    }));

    return NextResponse.json({ messages: uiMessages });
  } catch (error) {
    chatLogger.error("get.error", "Failed to fetch chat messages", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/chat/messages?id=<messageId>
 * Deletes a message and all subsequent messages in the same chat (cascade delete).
 * Only the message owner can delete their messages.
 * Only USER messages can be deleted directly.
 */
export async function DELETE(request: Request) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get message ID from query params
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    // Get internal user
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the message to delete
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verify ownership
    if (message.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only allow deleting USER messages directly
    if (message.role !== "USER") {
      return NextResponse.json(
        { error: "Only user messages can be deleted" },
        { status: 400 },
      );
    }

    const deletedMessageWhere = chatMessageSuffixWhere(
      user.id,
      message.chatId,
      message,
    );

    // Delete private voice objects before their Message/Attachment references
    // disappear in the following hard delete.
    await deletePrivateVoiceBlobsForMessages(deletedMessageWhere);

    // Delete this message and all subsequent messages in the same chat (cascade)
    // This keeps conversation coherent - deleting a user message also removes
    // the assistant response and any follow-up conversation
    const deleteResult = await prisma.message.deleteMany({
      where: deletedMessageWhere,
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    chatLogger.error("delete.error", "Failed to delete chat message", {
      error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/chat/messages
 * Edit a message content. Deletes the edited message and all subsequent messages.
 * The caller should then re-send the edited message to regenerate the response.
 *
 * Body: { messageId: string, content: string }
 */
export async function PATCH(request: Request) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      const parsedBody = await request.json();
      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (body.content !== undefined && typeof body.content !== "string") {
      return NextResponse.json(
        { error: "content must be a string" },
        { status: 400 },
      );
    }
    const content = typeof body.content === "string" ? body.content : undefined;

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    // Get internal user
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the message to edit
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verify ownership
    if (message.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only allow editing USER messages
    if (message.role !== "USER") {
      return NextResponse.json(
        { error: "Only user messages can be edited" },
        { status: 400 },
      );
    }

    const deletedMessageWhere = chatMessageSuffixWhere(
      user.id,
      message.chatId,
      message,
    );

    await deletePrivateVoiceBlobsForMessages(deletedMessageWhere);

    // Delete this message and all subsequent messages
    const deleteResult = await prisma.message.deleteMany({
      where: deletedMessageWhere,
    });

    // Return the new content so the frontend can re-send it
    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
      chatId: message.chatId,
      newContent: content || getTextFromParts(message.parts),
    });
  } catch (error) {
    chatLogger.error("patch.error", "Failed to edit chat message", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
