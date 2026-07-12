import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptAiTurnTracePayload,
  encryptAiTurnTracePayload,
} from "./trace-crypto";

const originalKey = process.env.AI_TRACE_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey) {
    process.env.AI_TRACE_ENCRYPTION_KEY = originalKey;
  } else {
    delete process.env.AI_TRACE_ENCRYPTION_KEY;
  }
});

describe("AI turn trace encryption", () => {
  it("round-trips AES-256-GCM payloads", () => {
    process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptAiTurnTracePayload({
      text: "riservato",
      count: 2,
    });

    expect(
      decryptAiTurnTracePayload({
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
      }),
    ).toEqual({ text: "riservato", count: 2 });
  });

  it("rejects altered ciphertext", () => {
    process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptAiTurnTracePayload({ text: "riservato" });
    encrypted.ciphertext[0] ^= 1;

    expect(() =>
      decryptAiTurnTracePayload({
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
      }),
    ).toThrow();
  });
});
