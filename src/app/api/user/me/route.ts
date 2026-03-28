/**
 * Current user self-service API
 * DELETE /api/user/me — permanently delete own account
 */

import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const logger = createLogger("auth");

export async function DELETE() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Delete from Clerk first — invalidates all active sessions
    const client = await clerkClient();
    await client.users.deleteUser(user.clerkId);

    // Delete from DB — cascades to chats, messages, preferences, profile, memberships
    await prisma.user.delete({ where: { id: user.id } });

    logger.info("user.deleted", "User deleted own account", {
      userId: user.id,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    logger.error("user.delete.error", "Failed to delete user account", {
      userId: user.id,
      err,
    });
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
