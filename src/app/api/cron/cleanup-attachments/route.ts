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

import { BlobNotFoundError, del } from "@vercel/blob";

import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getAttachmentRetentionDays } from "@/lib/rate-limit/config";
import {
  deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl,
} from "@/lib/voice/storage";

const cronLogger = createLogger("maintenance");

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds

const DEFAULT_USER_BATCH_SIZE = 25;
const DEFAULT_ATTACHMENT_BATCH_SIZE = 20;
const DEFAULT_MAX_ATTACHMENTS_PER_RUN = 100;
const DEFAULT_DELETE_CONCURRENCY = 5;

const MAX_USER_BATCH_SIZE = 100;
const MAX_ATTACHMENT_BATCH_SIZE = 100;
const MAX_ATTACHMENTS_PER_RUN = 500;
const MAX_DELETE_CONCURRENCY = 20;

type CleanupConfig = {
  userBatchSize: number;
  attachmentBatchSize: number;
  maxAttachmentsPerRun: number;
  deleteConcurrency: number;
};

type CleanupStats = {
  scannedUsers: number;
  processedUsers: number;
  scannedAttachments: number;
  deletedAttachments: number;
  deletedBlobs: number;
  missingBlobs: number;
  errors: number;
};

type AttachmentToDelete = {
  id: string;
  blobUrl: string | null;
};

function getPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function getCleanupConfig(): CleanupConfig {
  return {
    userBatchSize: getPositiveInteger(
      process.env.ATTACHMENT_CLEANUP_USER_BATCH_SIZE,
      DEFAULT_USER_BATCH_SIZE,
      MAX_USER_BATCH_SIZE,
    ),
    attachmentBatchSize: getPositiveInteger(
      process.env.ATTACHMENT_CLEANUP_ATTACHMENT_BATCH_SIZE,
      DEFAULT_ATTACHMENT_BATCH_SIZE,
      MAX_ATTACHMENT_BATCH_SIZE,
    ),
    maxAttachmentsPerRun: getPositiveInteger(
      process.env.ATTACHMENT_CLEANUP_MAX_ATTACHMENTS_PER_RUN,
      DEFAULT_MAX_ATTACHMENTS_PER_RUN,
      MAX_ATTACHMENTS_PER_RUN,
    ),
    deleteConcurrency: getPositiveInteger(
      process.env.ATTACHMENT_CLEANUP_DELETE_CONCURRENCY,
      DEFAULT_DELETE_CONCURRENCY,
      MAX_DELETE_CONCURRENCY,
    ),
  };
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        if (item === undefined) {
          continue;
        }

        await callback(item);
      }
    }),
  );
}

async function deleteAttachment(
  attachment: AttachmentToDelete,
  stats: CleanupStats,
): Promise<void> {
  if (attachment.blobUrl) {
    try {
      if (isPrivateVoiceBlobUrl(attachment.blobUrl)) {
        await deletePrivateVoiceBlob(attachment.blobUrl);
      } else {
        await del(attachment.blobUrl);
      }
      stats.deletedBlobs += 1;
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        stats.missingBlobs += 1;
      } else {
        cronLogger.error(
          "cleanup.blob_delete_failed",
          "Failed to delete attachment blob; keeping database record for retry",
          {
            attachmentId: attachment.id,
            errorName: error instanceof Error ? error.name : "unknown",
          },
        );
        stats.errors += 1;
        return;
      }
    }
  }

  try {
    await prisma.attachment.delete({
      where: { id: attachment.id },
    });
    stats.deletedAttachments += 1;
  } catch (error) {
    cronLogger.error(
      "cleanup.database_delete_failed",
      "Failed to delete attachment database record",
      { attachmentId: attachment.id, error },
    );
    stats.errors += 1;
  }
}

/**
 * POST /api/cron/cleanup-attachments
 * Clean up expired attachments based on subscription plan retention policies.
 */
export async function POST(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    cronLogger.error(
      "cleanup.unauthorized",
      "Unauthorized cleanup cron request",
    );
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = getCleanupConfig();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const resumeCurrentUser =
      cursor !== undefined && url.searchParams.get("resume") === "true";
    const stats: CleanupStats = {
      scannedUsers: 0,
      processedUsers: 0,
      scannedAttachments: 0,
      deletedAttachments: 0,
      deletedBlobs: 0,
      missingBlobs: 0,
      errors: 0,
    };

    cronLogger.info("cleanup.start", "Starting attachment cleanup", {
      config,
      cursor: cursor ?? null,
      resumeCurrentUser,
    });

    // Fetch one cursor page per invocation so cron work is bounded. A caller can
    // resume a longer sweep by passing the returned pagination fields in the
    // next request. `resume=true` retries the current user's next attachment page.
    const userPage = await prisma.user.findMany({
      take: config.userBatchSize + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            ...(resumeCurrentUser ? {} : { skip: 1 }),
          }
        : {}),
      orderBy: { id: "asc" },
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

    const hasMoreUserPage = userPage.length > config.userBatchSize;
    const users = hasMoreUserPage
      ? userPage.slice(0, config.userBatchSize)
      : userPage;
    let pagination = {
      hasMore: hasMoreUserPage,
      nextCursor: hasMoreUserPage ? (users.at(-1)?.id ?? null) : null,
      resumeCurrentUser: false,
    };

    stats.scannedUsers = users.length;

    for (const user of users) {
      const remainingAttachmentBudget =
        config.maxAttachmentsPerRun - stats.scannedAttachments;

      if (remainingAttachmentBudget <= 0) {
        pagination = {
          hasMore: true,
          nextCursor: user.id,
          resumeCurrentUser: true,
        };
        break;
      }

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

      // Load one bounded page per user. The URL checks preserve support for
      // legacy attachments that do not have an associated message.
      const attachmentLimit = Math.min(
        config.attachmentBatchSize,
        remainingAttachmentBudget,
      );
      const attachmentPage = await prisma.attachment.findMany({
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
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: attachmentLimit + 1,
        select: {
          id: true,
          blobUrl: true,
        },
      });
      const hasMoreAttachments = attachmentPage.length > attachmentLimit;
      const expiredAttachments = hasMoreAttachments
        ? attachmentPage.slice(0, attachmentLimit)
        : attachmentPage;

      stats.scannedAttachments += expiredAttachments.length;

      await forEachWithConcurrency(
        expiredAttachments,
        config.deleteConcurrency,
        async (attachment) => deleteAttachment(attachment, stats),
      );

      if (expiredAttachments.length > 0) {
        stats.processedUsers++;
      }

      if (hasMoreAttachments) {
        pagination = {
          hasMore: true,
          nextCursor: user.id,
          resumeCurrentUser: true,
        };
        break;
      }
    }

    cronLogger.info("cleanup.complete", "Attachment cleanup complete", {
      stats,
      pagination,
      config,
    });

    return Response.json({
      success: true,
      message: "Attachment cleanup complete",
      stats,
      pagination,
    });
  } catch (error) {
    cronLogger.error("cleanup.fatal", "Fatal error during attachment cleanup", {
      error,
    });
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
