import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/chat/messages?chatId=<chatId>
 * Returns the chat history for a specific chat.
 */
export async function GET(request: NextRequest) {
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

    // Fetch messages for the user, ordered by creation time
    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      take: 100, // Limit to last 100 messages
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
      },
    });

    // Convert to UI message format
    const uiMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content || "",
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
    console.error("[Chat Messages API] Error:", error);
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
export async function DELETE(request: NextRequest) {
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

    // Delete this message and all subsequent messages in the same chat (cascade)
    // This keeps conversation coherent - deleting a user message also removes
    // the assistant response and any follow-up conversation
    const deleteResult = await prisma.message.deleteMany({
      where: {
        userId: user.id,
        chatId: message.chatId, // Only delete from the same chat
        createdAt: {
          gte: message.createdAt,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error("[Chat Messages API] Delete error:", error);
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
export async function PATCH(request: NextRequest) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, content } = body as {
      messageId: string;
      content?: string;
    };

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

    // Delete this message and all subsequent messages
    const deleteResult = await prisma.message.deleteMany({
      where: {
        userId: user.id,
        chatId: message.chatId,
        createdAt: {
          gte: message.createdAt,
        },
      },
    });

    // Return the new content so the frontend can re-send it
    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
      chatId: message.chatId,
      newContent: content || message.content,
    });
  } catch (error) {
    console.error("[Chat Messages API] Edit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
