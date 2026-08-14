import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  messageFindUnique: vi.fn(),
  txMessageFindUnique: vi.fn(),
  txMessageCreate: vi.fn(),
  attachmentUpdateMany: vi.fn(),
}));

const tx = {
  message: {
    findUnique: mocks.txMessageFindUnique,
    create: mocks.txMessageCreate,
  },
  attachment: {
    updateMany: mocks.attachmentUpdateMany,
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: { findUnique: mocks.messageFindUnique },
  },
}));

import {
  claimWebInboundMessage,
  findExistingWebInboundMessage,
  getWebClientPayloadHash,
  isValidWebClientMessageId,
  textFromPersistedAssistant,
} from "./web-inbound";

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    id: "inbound-1",
    userId: "user-1",
    chatId: "chat-1",
    conversationThreadId: "thread-1",
    clientMessagePayloadHash: "payload-hash",
    parts: [{ type: "text", text: "hello" }],
    generatedResponse: null,
    ...overrides,
  };
}

const claimInput = {
  userId: "user-1",
  chatId: "chat-1",
  conversationThreadId: "thread-1",
  clientMessageId: "client-message-1",
  payloadHash: "payload-hash",
  parts: [{ type: "text", text: "hello" }],
};

describe("web inbound idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.txMessageFindUnique.mockResolvedValue(null);
    mocks.txMessageCreate.mockResolvedValue(inbound());
    mocks.attachmentUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("accepts only bounded opaque client message IDs", () => {
    expect(isValidWebClientMessageId("msg_01J.test:retry-1")).toBe(true);
    expect(isValidWebClientMessageId("")).toBe(false);
    expect(isValidWebClientMessageId(" contains spaces ")).toBe(false);
    expect(isValidWebClientMessageId("x".repeat(129))).toBe(false);
  });

  it("hashes canonical payloads independent of object key order", () => {
    const first = getWebClientPayloadHash([
      { type: "text", text: "hello", metadata: { b: 2, a: 1 } },
    ]);
    const reordered = getWebClientPayloadHash([
      { metadata: { a: 1, b: 2 }, text: "hello", type: "text" },
    ]);
    const changed = getWebClientPayloadHash([
      { metadata: { a: 1, b: 2 }, text: "changed", type: "text" },
    ]);

    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a replay that changes chat or payload before generation", async () => {
    mocks.messageFindUnique.mockResolvedValue(inbound());

    await expect(
      findExistingWebInboundMessage({
        ...claimInput,
        payloadHash: "different-payload",
      }),
    ).rejects.toMatchObject({
      name: "WebInboundConflictError",
      reason: "payload_mismatch",
      status: 409,
    });
    await expect(
      findExistingWebInboundMessage({
        ...claimInput,
        chatId: "chat-2",
      }),
    ).rejects.toMatchObject({ reason: "chat_mismatch", status: 409 });
  });

  it("recovers all persisted assistant text for an exact replay", async () => {
    const message = inbound({
      generatedResponse: {
        id: "assistant-1",
        parts: [
          { type: "text", text: "first" },
          { type: "tool-call", toolName: "search" },
          { type: "text", text: " second" },
        ],
      },
    });
    mocks.messageFindUnique.mockResolvedValue(message);

    const existing = await findExistingWebInboundMessage(claimInput);

    expect(existing).toEqual(message);
    expect(
      textFromPersistedAssistant(existing?.generatedResponse ?? null),
    ).toBe("first second");
  });

  it("creates the canonical inbound and claims owned attachments atomically", async () => {
    mocks.attachmentUpdateMany.mockResolvedValue({ count: 2 });

    await expect(
      claimWebInboundMessage({
        ...claimInput,
        parts: [{ type: "text", text: "canonical persisted text" }],
        attachmentIds: ["attachment-1", "attachment-2", "attachment-1"],
      }),
    ).resolves.toEqual({ message: inbound(), created: true });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txMessageFindUnique).not.toHaveBeenCalled();
    expect(mocks.txMessageCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        channel: "WEB",
        direction: "INBOUND",
        role: "USER",
        type: "TEXT",
        clientMessageId: "client-message-1",
        clientMessagePayloadHash: "payload-hash",
        parts: [{ type: "text", text: "canonical persisted text" }],
      },
      select: expect.any(Object),
    });
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["attachment-1", "attachment-2"] },
        userId: "user-1",
        messageId: null,
      },
      data: { messageId: "inbound-1" },
    });
  });

  it("fails the transaction when any attachment is not unclaimed and owned", async () => {
    mocks.attachmentUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      claimWebInboundMessage({
        ...claimInput,
        attachmentIds: ["attachment-1", "attachment-2"],
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "WebInboundConflictError",
        reason: "attachment_claim_failed",
        status: 409,
      }),
    );
  });

  it("re-reads and validates the winner of a concurrent unique race", async () => {
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error("unique constraint"), { code: "P2002" }),
    );
    mocks.messageFindUnique.mockResolvedValue(inbound());

    await expect(claimWebInboundMessage(claimInput)).resolves.toEqual({
      message: inbound(),
      created: false,
    });

    mocks.messageFindUnique.mockResolvedValue(
      inbound({ clientMessagePayloadHash: "winner-used-different-payload" }),
    );
    await expect(claimWebInboundMessage(claimInput)).rejects.toMatchObject({
      reason: "payload_mismatch",
      status: 409,
    });
  });
});
