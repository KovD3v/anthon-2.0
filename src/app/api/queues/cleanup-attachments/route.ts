import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  enqueueAttachmentCleanupContinuation,
  runAttachmentCleanup,
} from "@/lib/maintenance/attachment-cleanup";
import { verifyQStashAuth } from "@/lib/qstash";

const qstashLogger = createLogger("qstash");

function parseContinuationPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid cleanup continuation payload");
  }

  const input = payload as Record<string, unknown>;
  const cursor = input.cursor;
  const resumeCurrentUser = input.resumeCurrentUser;
  const attachmentCursor = input.attachmentCursor;
  if (
    (cursor !== undefined && typeof cursor !== "string") ||
    (resumeCurrentUser !== undefined &&
      typeof resumeCurrentUser !== "boolean") ||
    (attachmentCursor !== undefined && typeof attachmentCursor !== "string")
  ) {
    throw new Error("Invalid cleanup continuation payload");
  }

  return {
    cursor: cursor || undefined,
    resumeCurrentUser: Boolean(resumeCurrentUser),
    ...(attachmentCursor ? { attachmentCursor } : {}),
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await verifyQStashAuth(request);
  } catch (error) {
    qstashLogger.warn(
      "cleanup.unauthorized",
      "Invalid cleanup queue signature",
      {
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await runAttachmentCleanup(
      parseContinuationPayload(payload),
    );
    await enqueueAttachmentCleanupContinuation(result.pagination);
    return NextResponse.json({
      success: true,
      message: "Attachment cleanup complete",
      ...result,
    });
  } catch (error) {
    qstashLogger.error("cleanup.error", "Attachment cleanup queue job failed", {
      error,
    });
    return new NextResponse("Attachment cleanup failed", { status: 500 });
  }
}
