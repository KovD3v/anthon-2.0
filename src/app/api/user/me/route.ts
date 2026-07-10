/**
 * Current user self-service API
 * DELETE /api/user/me — permanently delete own account
 */

import { clerkClient } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
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
    const createdOrganizationCount = await prisma.organization.count({
      where: { createdByUserId: user.id },
    });

    if (createdOrganizationCount > 0) {
      return NextResponse.json(
        {
          error:
            "Delete organizations created by this account or contact support before deleting it",
          code: "ORGANIZATION_CREATOR_DELETION_BLOCKED",
        },
        { status: 409 },
      );
    }

    const [attachments, artifactVersions] = await Promise.all([
      prisma.attachment.findMany({
        where: {
          OR: [
            { message: { userId: user.id } },
            {
              messageId: null,
              blobUrl: { contains: `/uploads/${user.id}/` },
            },
            {
              messageId: null,
              blobUrl: { contains: `/attachments/${user.id}/` },
            },
          ],
        },
        select: { blobUrl: true },
      }),
      prisma.artifactVersion.findMany({
        where: { artifact: { chat: { userId: user.id } } },
        select: { blobUrl: true },
      }),
    ]);

    const blobUrls = [
      ...attachments.map(({ blobUrl }) => blobUrl),
      ...artifactVersions.map(({ blobUrl }) => blobUrl),
    ].filter((url): url is string => Boolean(url));

    // Remove external objects before deleting ownership records so a failed
    // cleanup remains retryable through this endpoint.
    if (blobUrls.length > 0) {
      await del([...new Set(blobUrls)]);
    }

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
