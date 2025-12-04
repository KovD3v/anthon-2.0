import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/chat/messages
 * Returns the chat history for the current user.
 */
export async function GET() {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get internal user
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      // No user yet, return empty messages
      return NextResponse.json({ messages: [] });
    }

    // Fetch messages for the user, ordered by creation time
    // Limit to recent messages to avoid loading too much
    const messages = await prisma.message.findMany({
      where: {
        userId: user.id,
        channel: "WHATSAPP", // Web chat uses WHATSAPP channel for now
        type: "TEXT",
      },
      orderBy: { createdAt: "asc" },
      take: 100, // Limit to last 100 messages
    });

    // Convert to UI message format
    const uiMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content || "",
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages: uiMessages });
  } catch (error) {
    console.error("[Chat Messages API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/messages?id=<messageId>
 * Deletes a message and all subsequent messages (cascade delete).
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
        { status: 400 }
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
        { status: 400 }
      );
    }

    // Delete this message and all subsequent messages (cascade)
    // This keeps conversation coherent - deleting a user message also removes
    // the assistant response and any follow-up conversation
    const deleteResult = await prisma.message.deleteMany({
      where: {
        userId: user.id,
        channel: message.channel,
        createdAt: {
          gte: message.createdAt,
        },
      },
    });

    console.log(
      `[Chat Messages API] Deleted ${deleteResult.count} messages (cascade from ${messageId})`
    );

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error("[Chat Messages API] Delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
