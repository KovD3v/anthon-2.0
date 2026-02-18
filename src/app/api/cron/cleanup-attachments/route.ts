/**
 * Attachment Cleanup Cron API Route
 *
 * This endpoint should be called by a scheduled cron job (e.g., Vercel Cron)
 * to clean up expired attachments based on user subscription plans.
 *
 * POST /api/cron/cleanup-attachments
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized access
 */

import { del } from "@vercel/blob";

import { prisma } from "@/lib/db";
import { getAttachmentRetentionDays } from "@/lib/rate-limit/config";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds

/**
 * POST /api/cron/cleanup-attachments
 * Clean up expired attachments based on subscription plan retention policies.
 */
export async function POST(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error("[Cleanup Cron] Unauthorized request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cleanup Cron] Starting attachment cleanup...");

  try {
    // Track cleanup stats
    const stats = {
      processedUsers: 0,
      deletedAttachments: 0,
      deletedBlobs: 0,
      errors: 0,
    };

    // Get all users with their subscription info
    const users = await prisma.user.findMany({
      select: {
        id: true,
        role: true,
        isGuest: true,
        subscription: {
          select: {
            status: true,
            planId: true,
          },
        },
      },
    });

    for (const user of users) {
      // Determine retention days for this user
      const retentionDays = getAttachmentRetentionDays(
        user.subscription?.status ?? undefined,
        user.role ?? undefined,
        user.subscription?.planId ?? null,
        user.isGuest ?? false,
      );

      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Find expired attachments for this user via their messages
      const expiredAttachments = await prisma.attachment.findMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          OR: [
            {
              message: {
                userId: user.id,
              },
            },
            {
              messageId: null,
              blobUrl: {
                contains: `/uploads/${user.id}/`,
              },
            },
            {
              messageId: null,
              blobUrl: {
                contains: `/attachments/${user.id}/`,
              },
            },
          ],
        },
        select: {
          id: true,
          blobUrl: true,
        },
      });

      // Delete each expired attachment
      for (const attachment of expiredAttachments) {
        try {
          // Delete from Vercel Blob
          if (attachment.blobUrl) {
            await del(attachment.blobUrl);
            stats.deletedBlobs++;
          }

          // Delete from database
          await prisma.attachment.delete({
            where: { id: attachment.id },
          });
          stats.deletedAttachments++;
        } catch (error) {
          console.error(
            `[Cleanup Cron] Error deleting attachment ${attachment.id}:`,
            error,
          );
          stats.errors++;
        }
      }

      if (expiredAttachments.length > 0) {
        stats.processedUsers++;
      }
    }

    console.log("[Cleanup Cron] Cleanup complete:", stats);

    return Response.json({
      success: true,
      message: "Attachment cleanup complete",
      stats,
    });
  } catch (error) {
    console.error("[Cleanup Cron] Fatal error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 },
    );
  }
}

// Also handle GET for easier testing
export async function GET(request: Request) {
  return POST(request);
}
