import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";
import { createLogger } from "@/lib/logger";
import { deletePrivateVoiceBlobsForMessages } from "@/lib/voice/attachment-cleanup";

const guestMessageLogger = createLogger("auth");

export const runtime = "nodejs";

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
 * DELETE /api/guest/chat/messages?id=<messageId>
 * Deletes a guest message and its conversation suffix.
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await authenticateGuest(request);
    const messageId = new URL(request.url).searchParams.get("id");

    if (!messageId) {
      return Response.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        userId: true,
        chatId: true,
        role: true,
        createdAt: true,
      },
    });

    if (!message) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.userId !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message.role !== "USER") {
      return Response.json(
        { error: "Only user messages can be deleted" },
        { status: 400 },
      );
    }

    const deletedMessageWhere = chatMessageSuffixWhere(
      user.id,
      message.chatId,
      message,
    );

    await deletePrivateVoiceBlobsForMessages(deletedMessageWhere);
    const deleteResult = await prisma.message.deleteMany({
      where: deletedMessageWhere,
    });

    return Response.json({
      success: true,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    guestMessageLogger.error(
      "message.delete.error",
      "Failed to delete guest chat message",
      { error },
    );
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
