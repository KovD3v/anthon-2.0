import { publishToQueue } from "@/lib/qstash";

export const EXTERNAL_INBOUND_QUEUE_ENDPOINT = "api/queues/external-inbound";
// The inbound lease is five minutes. This backoff keeps the final bounded
// retry beyond that lease so a worker crash can be reclaimed before QStash
// exhausts delivery attempts.
export const EXTERNAL_INBOUND_QUEUE_RETRIES = 5;
export const EXTERNAL_INBOUND_QUEUE_RETRY_DELAY = "10000 * pow(2, retried)";

export type ExternalInboundQueueChannel = "TELEGRAM" | "WHATSAPP";
export type ExternalInboundProcessingResult =
  | "completed"
  | "failed"
  | "retry"
  | "ignored";

export function resolveExternalInboundResult({
  status,
  completedStatus = "COMPLETED",
  missingResult = "ignored",
}: {
  status?: string | null;
  completedStatus?: "COMPLETED" | "SENT";
  missingResult?: ExternalInboundProcessingResult;
}): ExternalInboundProcessingResult {
  if (status === completedStatus) return "completed";
  if (status === "FAILED") return "failed";
  if (status === "PENDING" || status === "PROCESSING" || status === "SENDING") {
    return "retry";
  }
  return missingResult;
}

/**
 * The queue body contains only the provider message needed for processing.
 * QStash remains the durable delivery mechanism; provider webhook retries are
 * still safe because the handler fences the persisted inbound claim.
 */
export function enqueueExternalInbound({
  channel,
  externalMessageId,
  payload,
}: {
  channel: ExternalInboundQueueChannel;
  externalMessageId: string;
  payload: unknown;
}) {
  return publishToQueue(EXTERNAL_INBOUND_QUEUE_ENDPOINT, payload, {
    deduplicationId: `external-inbound:${channel}:${externalMessageId}`,
    retries: EXTERNAL_INBOUND_QUEUE_RETRIES,
    retryDelay: EXTERNAL_INBOUND_QUEUE_RETRY_DELAY,
  });
}
