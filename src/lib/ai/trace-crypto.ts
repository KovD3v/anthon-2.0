import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptAiTurnTracePayload(payload: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getTraceKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decryptAiTurnTracePayload(payload: {
  payloadCiphertext: Uint8Array | null;
  payloadIv: Uint8Array | null;
  payloadTag: Uint8Array | null;
}): Record<string, unknown> | null {
  if (!payload.payloadCiphertext || !payload.payloadIv || !payload.payloadTag) {
    return null;
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getTraceKey(),
    payload.payloadIv,
  );
  decipher.setAuthTag(Buffer.from(payload.payloadTag));
  const plaintext = Buffer.concat([
    decipher.update(payload.payloadCiphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as Record<string, unknown>;
}

function getTraceKey() {
  const configured = process.env.AI_TRACE_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("AI_TRACE_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("AI_TRACE_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}
