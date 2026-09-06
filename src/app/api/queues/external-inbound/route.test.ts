import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyQStashAuth: vi.fn(),
  processTelegramWebhookUpdate: vi.fn(),
  processWhatsAppInboundMessage: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

vi.mock("@/lib/channels/telegram/webhook-handler", () => ({
  processTelegramWebhookUpdate: mocks.processTelegramWebhookUpdate,
}));

vi.mock("@/lib/channels/whatsapp/webhook-handler", () => ({
  processWhatsAppInboundMessage: mocks.processWhatsAppInboundMessage,
}));

import { POST } from "./route";

const telegramPayload = {
  channel: "TELEGRAM" as const,
  update: {
    update_id: 17,
    message: {
      message_id: 4,
      date: 1_700_000_000,
      chat: { id: 100, type: "private" },
      from: { id: 200, is_bot: false },
      text: "ciao",
    },
  },
};

const whatsappPayload = {
  channel: "WHATSAPP" as const,
  message: {
    id: "wamid_1",
    from: "39333111222",
    timestamp: "1700000000",
    type: "text",
    text: { body: "ciao" },
  },
  context: {
    messaging_product: "whatsapp" as const,
    metadata: {
      display_phone_number: "3900000000",
      phone_number_id: "phone_1",
    },
  },
};

describe("POST /api/queues/external-inbound", () => {
  beforeEach(() => {
    mocks.verifyQStashAuth.mockReset();
    mocks.processTelegramWebhookUpdate.mockReset();
    mocks.processWhatsAppInboundMessage.mockReset();
    mocks.verifyQStashAuth.mockResolvedValue(telegramPayload);
    mocks.processTelegramWebhookUpdate.mockResolvedValue("completed");
    mocks.processWhatsAppInboundMessage.mockResolvedValue("completed");
  });

  it("rejects requests without a valid QStash signature", async () => {
    mocks.verifyQStashAuth.mockRejectedValue(new Error("bad signature"));

    const response = await POST(
      new Request("http://localhost/api/queues/external-inbound", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.processTelegramWebhookUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed queue payloads", async () => {
    mocks.verifyQStashAuth.mockResolvedValue({ channel: "TELEGRAM" });

    const response = await POST(
      new Request("http://localhost/api/queues/external-inbound", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("asks QStash to retry a worker failure and acknowledges recovery", async () => {
    mocks.processTelegramWebhookUpdate
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("completed");

    const first = await POST(
      new Request("http://localhost/api/queues/external-inbound"),
    );
    expect(first.status).toBe(503);

    const second = await POST(
      new Request("http://localhost/api/queues/external-inbound"),
    );
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({
      success: true,
      result: "completed",
    });
    expect(mocks.processTelegramWebhookUpdate).toHaveBeenNthCalledWith(
      1,
      telegramPayload.update,
    );
  });

  it("dispatches a WhatsApp message with its provider context", async () => {
    mocks.verifyQStashAuth.mockResolvedValue(whatsappPayload);

    const response = await POST(
      new Request("http://localhost/api/queues/external-inbound"),
    );

    expect(response.status).toBe(200);
    expect(mocks.processWhatsAppInboundMessage).toHaveBeenCalledWith(
      whatsappPayload.message,
      whatsappPayload.context,
    );
    expect(mocks.processTelegramWebhookUpdate).not.toHaveBeenCalled();
  });

  it("retries a leased duplicate instead of acknowledging it", async () => {
    mocks.processTelegramWebhookUpdate.mockResolvedValue("retry");

    const response = await POST(
      new Request("http://localhost/api/queues/external-inbound"),
    );

    expect(response.status).toBe(503);
  });
});
