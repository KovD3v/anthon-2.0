import { describe, expect, it, vi } from "vitest";

const publishToQueue = vi.hoisted(() => vi.fn());

vi.mock("@/lib/qstash", () => ({
  publishToQueue,
}));

import {
  EXTERNAL_INBOUND_QUEUE_ENDPOINT,
  EXTERNAL_INBOUND_QUEUE_RETRIES,
  EXTERNAL_INBOUND_QUEUE_RETRY_DELAY,
  enqueueExternalInbound,
  resolveExternalInboundResult,
} from "./external-inbound-queue";

describe("external inbound queue", () => {
  it("publishes a provider message with bounded lease-aware retries", async () => {
    publishToQueue.mockReset().mockResolvedValue({ messageId: "queued-1" });

    await enqueueExternalInbound({
      channel: "WHATSAPP",
      externalMessageId: "wamid-1",
      payload: { channel: "WHATSAPP", message: { id: "wamid-1" } },
    });

    expect(publishToQueue).toHaveBeenCalledWith(
      EXTERNAL_INBOUND_QUEUE_ENDPOINT,
      { channel: "WHATSAPP", message: { id: "wamid-1" } },
      {
        deduplicationId: "external-inbound:WHATSAPP:wamid-1",
        retries: EXTERNAL_INBOUND_QUEUE_RETRIES,
        retryDelay: EXTERNAL_INBOUND_QUEUE_RETRY_DELAY,
      },
    );
  });

  it.each([
    ["COMPLETED", "completed"],
    ["FAILED", "failed"],
    ["PROCESSING", "retry"],
    ["SENDING", "retry"],
    [undefined, "ignored"],
  ] as const)("maps %s worker state to %s", (status, expected) => {
    expect(resolveExternalInboundResult({ status })).toBe(expected);
  });
});
