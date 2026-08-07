import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  publishJSON: vi.fn(),
  receiverVerify: vi.fn(),
  receiver: vi.fn(),
}));

vi.mock("@upstash/qstash", () => ({
  Client: mocks.client,
  Receiver: mocks.receiver,
}));

import { publishToQueue, verifyQStashAuth } from "./qstash";

describe("QStash helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("QSTASH_TOKEN", "qstash-token");
    vi.stubEnv("QSTASH_URL", "https://qstash.upstash.io");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-signing-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-signing-key");
    mocks.publishJSON.mockReset().mockResolvedValue({ messageId: "queued-1" });
    mocks.client.mockReset().mockImplementation(function Client() {
      return { publishJSON: mocks.publishJSON };
    });
    mocks.receiverVerify.mockReset().mockResolvedValue(true);
    mocks.receiver.mockReset().mockImplementation(function Receiver() {
      return { verify: mocks.receiverVerify };
    });
  });

  it("uses the Vercel production domain when APP_URL points to localhost", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "anthon-2-0.vercel.app");

    await publishToQueue("api/queues/voice", { messageId: "message-1" });

    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: "https://anthon-2-0.vercel.app/api/queues/voice",
      body: { messageId: "message-1" },
      delay: undefined,
      deduplicationId: undefined,
      retries: undefined,
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
