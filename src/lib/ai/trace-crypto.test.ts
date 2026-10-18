import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptAiTurnTracePayload,
  encryptAiTurnTracePayload,
} from "./trace-crypto";

const originalKey = process.env.AI_TRACE_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.AI_TRACE_ENCRYPTION_KEY;
  } else {
    process.env.AI_TRACE_ENCRYPTION_KEY = originalKey;
  }
});

describe("AI trace authentication tags", () => {
  it("round-trips a full 16-byte tag", () => {
    process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const payload = { text: "synthetic trace" };
    const encrypted = encryptAiTurnTracePayload(payload);

    expect(encrypted.tag.length).toBe(16);
    expect(
      decryptAiTurnTracePayload({
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
      }),
    ).toEqual(payload);
  });

  it.each([4, 8, 12, 13, 14, 15])(
    "rejects a tag truncated to %i bytes",
    (length) => {
      process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const encrypted = encryptAiTurnTracePayload({ text: "synthetic trace" });

      expect(() =>
        decryptAiTurnTracePayload({
          payloadCiphertext: encrypted.ciphertext,
          payloadIv: encrypted.iv,
          payloadTag: encrypted.tag.subarray(0, length),
        }),
      ).toThrow();
    },
  );
});
