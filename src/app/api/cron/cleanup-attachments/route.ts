/**
 * Attachment Cleanup Cron API Route
 *
 * The Vercel Cron entry point owns the CRON_SECRET boundary. Work that does
 * not fit in one bounded invocation is continued by the signed QStash worker
 * at /api/queues/cleanup-attachments.
 */

import { createLogger } from "@/lib/logger";
import {
  enqueueAttachmentCleanupContinuation,
  runAttachmentCleanup,
} from "@/lib/maintenance/attachment-cleanup";

const cronLogger = createLogger("maintenance");

export const maxDuration = 60;

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret &&
      request.headers.get("authorization") === `Bearer ${cronSecret}`,
  );
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    cronLogger.error(
      "cleanup.unauthorized",
      "Unauthorized cleanup cron request",
    );
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runAttachmentCleanup({
      cursor: url.searchParams.get("cursor") || undefined,
      resumeCurrentUser: url.searchParams.get("resume") === "true",
      attachmentCursor: url.searchParams.get("attachmentCursor") || undefined,
    });
    await enqueueAttachmentCleanupContinuation(result.pagination);

    return Response.json({
      success: true,
      message: "Attachment cleanup complete",
      ...result,
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

/**
 * POST /api/cron/cleanup-attachments
 * Clean up expired attachments based on subscription plan retention policies.
 */
export async function POST(request: Request) {
  return run(request);
}

// Also handle GET for Vercel Cron and manual testing.
export async function GET(request: Request) {
  return run(request);
}
