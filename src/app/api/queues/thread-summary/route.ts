import {
  processThreadSummaryJob,
  type ThreadSummaryJob,
} from "@/lib/ai/thread-context";
import { createLogger } from "@/lib/logger";
import { verifyQStashAuth } from "@/lib/qstash";

const summaryLogger = createLogger("ai");

export const maxDuration = 60;

function isThreadSummaryJob(payload: unknown): payload is ThreadSummaryJob {
  if (!payload || typeof payload !== "object") return false;
  const job = payload as Record<string, unknown>;
  if (
    typeof job.conversationThreadId !== "string" ||
    !job.conversationThreadId ||
    typeof job.userId !== "string" ||
    !job.userId
  ) {
    return false;
  }
  if (job.continuation === undefined) return true;
  if (!job.continuation || typeof job.continuation !== "object") return false;
  const continuation = job.continuation as Record<string, unknown>;
  if (
    !(
      continuation.summaryId === null ||
      typeof continuation.summaryId === "string"
    ) ||
    typeof continuation.version !== "number" ||
    !Number.isSafeInteger(continuation.version) ||
    continuation.version < 0 ||
    (continuation.pendingUserId !== undefined &&
      (typeof continuation.pendingUserId !== "string" ||
        !continuation.pendingUserId))
  ) {
    return false;
  }
  if (continuation.after === undefined)
    return continuation.pendingUserId === undefined;
  if (!continuation.after || typeof continuation.after !== "object")
    return false;
  const after = continuation.after as Record<string, unknown>;
  return (
    typeof after.id === "string" &&
    after.id.length > 0 &&
    typeof after.createdAt === "string" &&
    Number.isFinite(Date.parse(after.createdAt))
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await verifyQStashAuth(request);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isThreadSummaryJob(payload)) {
    return new Response("Invalid thread summary job", { status: 400 });
  }
  try {
    const result = await processThreadSummaryJob(payload);
    return Response.json({ success: true, result });
  } catch (error) {
    summaryLogger.error(
      "thread_summary.queue_failed",
      "Thread summary job failed",
      {
        conversationThreadId: payload.conversationThreadId,
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
    // Retry both model failures and failed continuation publication. A delivery
    // always reads the latest checkpoint, so a retry after a commit moves on.
    return new Response("Thread summary retry requested", { status: 503 });
  }
}
