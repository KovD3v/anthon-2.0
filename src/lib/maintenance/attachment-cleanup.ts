import { BlobNotFoundError, del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getRetentionParams } from "@/lib/maintenance/retention-policy";
import { publishToQueue } from "@/lib/qstash";
import {
  deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl,
} from "@/lib/voice/storage";

const cronLogger = createLogger("maintenance");

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

export type AttachmentCleanupPagination = {
  hasMore: boolean;
  nextCursor: string | null;
  resumeCurrentUser: boolean;
  /** Last attachment id scanned for the resumed user. */
  attachmentCursor?: string;
};

export type AttachmentCleanupResult = {
  stats: CleanupStats;
  pagination: AttachmentCleanupPagination;
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

        if (item === undefined) continue;
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

export async function runAttachmentCleanup(input?: {
  cursor?: string;
  resumeCurrentUser?: boolean;
  attachmentCursor?: string;
}): Promise<AttachmentCleanupResult> {
  const config = getCleanupConfig();
  const cursor = input?.cursor;
  const resumeCurrentUser = Boolean(input?.resumeCurrentUser && cursor);
  const attachmentCursor = resumeCurrentUser
    ? input?.attachmentCursor
    : undefined;
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
    attachmentCursor: attachmentCursor ?? null,
  });

  const userPage = await prisma.user.findMany({
    take: config.userBatchSize + 1,
    ...(cursor
      ? {
          // A continuation may run after the anchor user is deleted. A
          // range predicate keeps the sweep moving instead of relying on a
          // Prisma cursor row that no longer exists.
          where: { id: resumeCurrentUser ? { gte: cursor } : { gt: cursor } },
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
  let pagination: AttachmentCleanupPagination = {
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

    const { retentionDays } = await getRetentionParams(user);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const attachmentLimit = Math.min(
      config.attachmentBatchSize,
      remainingAttachmentBudget,
    );
    const attachmentPage = await prisma.attachment.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        ...(user.id === cursor && attachmentCursor
          ? { id: { gt: attachmentCursor } }
          : {}),
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
      // The continuation cursor is the last scanned id, so keep the query
      // ordered by the same stable key even when a Blob deletion fails.
      orderBy: { id: "asc" },
      take: attachmentLimit + 1,
      select: { id: true, blobUrl: true },
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

    if (expiredAttachments.length > 0) stats.processedUsers += 1;

    if (hasMoreAttachments) {
      const lastScannedAttachment = expiredAttachments.at(-1);
      if (!lastScannedAttachment) {
        throw new Error("Attachment cleanup cursor did not advance");
      }
      pagination = {
        hasMore: true,
        nextCursor: user.id,
        resumeCurrentUser: true,
        attachmentCursor: lastScannedAttachment.id,
      };
      break;
    }
  }

  cronLogger.info("cleanup.complete", "Attachment cleanup complete", {
    stats,
    pagination,
    config,
  });

  return { stats, pagination };
}

export async function enqueueAttachmentCleanupContinuation(
  pagination: AttachmentCleanupPagination,
): Promise<void> {
  if (!pagination.hasMore || !pagination.nextCursor) return;

  await publishToQueue(
    "api/queues/cleanup-attachments",
    {
      cursor: pagination.nextCursor,
      resumeCurrentUser: pagination.resumeCurrentUser,
      ...(pagination.attachmentCursor
        ? { attachmentCursor: pagination.attachmentCursor }
        : {}),
    },
    {
      deduplicationId: [
        "attachment-cleanup",
        pagination.nextCursor,
        pagination.resumeCurrentUser ? "resume" : "next",
        pagination.attachmentCursor ?? "start",
      ].join(":"),
      retries: 5,
    },
  );
}
