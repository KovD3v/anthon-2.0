/**
 * Channel Identity API Route
 *
 * DELETE /api/channels/[id] - Disconnect a channel identity
 *
 * This allows users to unlink their external messaging accounts
 * (e.g., Telegram, WhatsApp) from their Anthon profile.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/channels/[id]
 * Disconnect a channel identity from the user's account.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return NextResponse.json(
      { error: error || "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Channel identity ID is required" },
      { status: 400 },
    );
  }

  try {
    // Find the channel identity and verify ownership
    const channelIdentity = await prisma.channelIdentity.findUnique({
      where: { id },
      select: {
        id: true,
        channel: true,
        externalId: true,
        userId: true,
      },
    });

    if (!channelIdentity) {
      return NextResponse.json(
        { error: "Channel identity not found" },
        { status: 404 },
      );
    }

    // Verify the channel belongs to the current user
    if (channelIdentity.userId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete the channel identity
    await prisma.channelIdentity.delete({
      where: { id },
    });

    console.log(
      `[Channels API] User ${user.id} disconnected ${channelIdentity.channel} identity ${channelIdentity.externalId}`,
    );

    return NextResponse.json({
      success: true,
      message: `${channelIdentity.channel} disconnected successfully`,
    });
  } catch (err) {
    console.error("[Channels API] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect channel" },
      { status: 500 },
    );
  }
}
