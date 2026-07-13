import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  receiverVerify: vi.fn(),
  receiver: vi.fn(),
}));

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn(),
  Receiver: mocks.receiver,
}));

import { verifyQStashAuth } from "./qstash";

describe("verifyQStashAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-signing-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-signing-key");
    mocks.receiverVerify.mockReset().mockResolvedValue(true);
    mocks.receiver.mockReset().mockImplementation(function Receiver() {
      return { verify: mocks.receiverVerify };
    });
  });

  it("binds the signature verification to the destination URL", async () => {
    const request = new Request("https://app.example/api/queues/voice", {
      method: "POST",
      headers: { "Upstash-Signature": "signed-payload" },
      body: JSON.stringify({ messageId: "message-1" }),
    });

    await expect(verifyQStashAuth(request)).resolves.toEqual({
      messageId: "message-1",
    });

    expect(mocks.receiverVerify).toHaveBeenCalledWith({
      signature: "signed-payload",
      body: JSON.stringify({ messageId: "message-1" }),
      url: "https://app.example/api/queues/voice",
    });
  });
});
