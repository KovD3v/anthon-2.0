import { deleteExpiredAiTurnTraces } from "@/lib/ai/trace";
import { createLogger } from "@/lib/logger";
import { cleanupExpiredAiUsageReservations } from "@/lib/rate-limit/reservation-retention";

const cronLogger = createLogger("maintenance");

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [deleted, usageReservations] = await Promise.all([
      deleteExpiredAiTurnTraces(),
      cleanupExpiredAiUsageReservations(),
    ]);
    cronLogger.info(
      "trace_cleanup.complete",
      "Expired AI traces and usage reservations removed",
      { deleted, usageReservations },
    );
    return Response.json({ success: true, deleted, usageReservations });
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
