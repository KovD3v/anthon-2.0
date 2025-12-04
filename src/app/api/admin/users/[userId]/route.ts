/**
 * Admin User Detail API
 * View detailed user info including messages/chats
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/admin/users/[userId] - Get user details with messages
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const params = await context.params;
  const { userId } = params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preferences: true,
        subscription: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get message stats
    const messageStats = await prisma.message.aggregate({
      where: { userId },
      _sum: {
        costUsd: true,
        outputTokens: true,
        reasoningTokens: true,
      },
      _avg: {
        generationTimeMs: true,
      },
      _count: true,
    });

    // Get recent messages (last 50)
    const recentMessages = await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        role: true,
        content: true,
        model: true,
        costUsd: true,
        toolCalls: true,
        createdAt: true,
      },
    });

    // Group messages by day for conversation-like view
    const messagesByDay = new Map<string, typeof recentMessages>();
    for (const msg of recentMessages) {
      const day = msg.createdAt.toISOString().split("T")[0];
      const existing = messagesByDay.get(day) || [];
      existing.push(msg);
      messagesByDay.set(day, existing);
    }

    const channels = Array.from(messagesByDay.entries()).map(
      ([date, messages]) => ({
        channelId: date,
        messageCount: messages.length,
        lastMessageAt: messages[0]?.createdAt,
        messages: messages.reverse(), // oldest first
      })
    );

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        profile: user.profile,
        preferences: user.preferences,
        subscription: user.subscription,
      },
      stats: {
        totalMessages: messageStats._count,
        totalCostUsd: messageStats._sum.costUsd ?? 0,
        totalOutputTokens: messageStats._sum.outputTokens ?? 0,
        totalReasoningTokens: messageStats._sum.reasoningTokens ?? 0,
        avgGenerationTimeMs: messageStats._avg.generationTimeMs ?? 0,
      },
      channels,
    });
  } catch (error) {
    console.error("[User Detail API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
