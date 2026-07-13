import { createLogger } from "@/lib/logger";
import { verifyQStashAuth } from "@/lib/qstash";
import { processVoiceGenerationJob } from "@/lib/voice/generation-jobs";

const voiceLogger = createLogger("voice");

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * QStash can redeliver this request. The worker owns idempotency through the
 * persisted message job, not through the transport's delivery count.
 */
export async function POST(request: Request) {
  let payload: { messageId?: unknown };
  try {
    payload = await verifyQStashAuth(request);
  } catch (error) {
    voiceLogger.warn(
      "voice.queue_unauthorized",
      "Rejected unsigned voice job",
      {
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (typeof payload.messageId !== "string" || !payload.messageId) {
    return new Response("Missing messageId", { status: 400 });
  }

  try {
    const result = await processVoiceGenerationJob(payload.messageId);

    // A non-2xx response asks QStash to apply the retry policy configured at
    // publish time. Terminal failures are acknowledged so the transcript stays
    // readable without an endless queue loop.
    if (result === "retry") {
      return new Response("Voice generation retry requested", { status: 503 });
    }

    return Response.json({ success: true, result });
  } catch (error) {
    voiceLogger.error("voice.queue_failed", "Voice worker crashed", {
      errorName: error instanceof Error ? error.name : "unknown",
      messageId: payload.messageId,
    });
    return new Response("Voice generation failed", { status: 503 });
  }
}
