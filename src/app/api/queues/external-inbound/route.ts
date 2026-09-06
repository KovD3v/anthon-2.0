import type { ExternalInboundProcessingResult } from "@/lib/channels/external-inbound-queue";
import {
  processTelegramWebhookUpdate,
  type TelegramUpdate,
} from "@/lib/channels/telegram/webhook-handler";
import {
  processWhatsAppInboundMessage,
  type WhatsAppChangeValue,
  type WhatsAppMessage,
} from "@/lib/channels/whatsapp/webhook-handler";
import { createLogger } from "@/lib/logger";
import { verifyQStashAuth } from "@/lib/qstash";

const externalInboundLogger = createLogger("qstash");

export const maxDuration = 60;

type ExternalInboundQueuePayload =
  | { channel: "TELEGRAM"; update: TelegramUpdate }
  | {
      channel: "WHATSAPP";
      message: WhatsAppMessage;
      context: WhatsAppChangeValue;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueuePayload(value: unknown): value is ExternalInboundQueuePayload {
  if (
    !isRecord(value) ||
    (value.channel !== "TELEGRAM" && value.channel !== "WHATSAPP")
  ) {
    return false;
  }

  if (value.channel === "TELEGRAM") {
    return isRecord(value.update) && typeof value.update.update_id === "number";
  }

  const message = value.message;
  const context = value.context;
  return (
    isRecord(message) &&
    typeof message.id === "string" &&
    message.id.length > 0 &&
    typeof message.from === "string" &&
    message.from.length > 0 &&
    typeof message.timestamp === "string" &&
    typeof message.type === "string" &&
    isRecord(context) &&
    context.messaging_product === "whatsapp" &&
    isRecord(context.metadata)
  );
}

function isRetryableResult(result: ExternalInboundProcessingResult) {
  return result === "failed" || result === "retry";
}

/**
 * QStash owns delivery retries. A non-2xx response keeps a failed or leased
 * inbound message recoverable while terminal duplicates are acknowledged.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await verifyQStashAuth(request);
  } catch (error) {
    externalInboundLogger.warn(
      "external_inbound.queue_unauthorized",
      "Rejected unsigned external inbound job",
      { errorName: error instanceof Error ? error.name : "unknown" },
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isQueuePayload(payload)) {
    return new Response("Invalid external inbound payload", { status: 400 });
  }

  try {
    const result =
      payload.channel === "TELEGRAM"
        ? await processTelegramWebhookUpdate(payload.update)
        : await processWhatsAppInboundMessage(payload.message, payload.context);

    if (isRetryableResult(result)) {
      return new Response("External inbound processing will be retried", {
        status: 503,
      });
    }

    return Response.json({ success: true, result });
  } catch (error) {
    externalInboundLogger.error(
      "external_inbound.queue_failed",
      "External inbound worker failed",
      {
        channel: payload.channel,
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
    return new Response("External inbound processing failed", { status: 503 });
  }
}
