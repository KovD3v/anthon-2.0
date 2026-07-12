import { deleteExpiredAiTurnTraces } from "@/lib/ai/trace";
import { createLogger } from "@/lib/logger";

const cronLogger = createLogger("maintenance");

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await deleteExpiredAiTurnTraces();
    cronLogger.info("trace_cleanup.complete", "Expired AI traces removed", {
      deleted,
    });
    return Response.json({ success: true, deleted });
  } catch (error) {
    cronLogger.error(
      "trace_cleanup.failed",
      "Failed removing expired AI traces",
      { error },
    );
    return Response.json({ error: "Trace cleanup failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
