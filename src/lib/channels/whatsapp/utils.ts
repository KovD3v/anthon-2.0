import { createHmac, timingSafeEqual } from "node:crypto";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";

const whatsappLogger = createLogger("webhook");

// Raw download budgets only. Base64/downstream limits remain separate, and
// every newly accepted media class must be assigned an explicit byte budget.
const WHATSAPP_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const WHATSAPP_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const WHATSAPP_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const WHATSAPP_MEDIA_TIMEOUT_MS = 10_000;

async function withWhatsAppMediaTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WHATSAPP_MEDIA_TIMEOUT_MS,
  );
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function isTrustedByteLength(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function getMediaMaxBytes(mimeType: string): number {
  if (mimeType.startsWith("audio/")) return WHATSAPP_AUDIO_MAX_BYTES;
  if (mimeType.startsWith("image/")) return WHATSAPP_IMAGE_MAX_BYTES;
  return WHATSAPP_DOCUMENT_MAX_BYTES;
}

function getTrustedContentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<Buffer | null> {
  const contentLength = getTrustedContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    whatsappLogger.warn("media.content_length_exceeded", "Media is too large", {
      contentLength,
      maxBytes,
    });
    return null;
  }

  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        whatsappLogger.warn(
          "media.stream_size_exceeded",
          "Media is too large",
          {
            receivedBytes: totalBytes,
            maxBytes,
          },
        );
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export function verifySignature(request: Request, body: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const hash = createHmac("sha256", secret).update(body).digest("hex");
  const expectedSignature = `sha256=${hash}`;

  if (signature.length !== expectedSignature.length) return false;

  return timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expectedSignature, "utf8"),
  );
}

export function isConnectCommand(text: string) {
  const norm = text.trim().toLowerCase();
  return (
    norm === "/connect" ||
    norm === "collega" ||
    norm === "collega profilo" ||
    norm === "connect"
  );
}

export function getPublicAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return true;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
    signal,
  });

  if (!res.ok) {
    whatsappLogger.error("send.message_failed", "Send message failed", {
      status: res.status,
      body: await res.text(),
    });
    return false;
  }

  return true;
}

export async function sendWhatsAppVoice(
  to: string,
  audioBuffer: Buffer,
): Promise<boolean> {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return false;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;

  return await LatencyLogger.measure("Voice: WhatsApp Send", async () => {
    try {
      const uploadUrl = `https://graph.facebook.com/v21.0/${phoneId}/media`;
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append(
        "file",
        new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }),
        "voice.mp3",
      );

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        whatsappLogger.error("voice.upload_failed", "Voice upload failed", {
          status: uploadRes.status,
        });
        return false;
      }

      const { id: mediaId } = (await uploadRes.json()) as { id: string };

      const sendUrl = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "audio",
          audio: { id: mediaId },
        }),
      });

      if (!sendRes.ok) {
        whatsappLogger.error("voice.send_failed", "Voice send failed", {
          status: sendRes.status,
        });
        return false;
      }

      return true;
    } catch (err) {
      whatsappLogger.error("voice.send_error", "sendWhatsAppVoice error", {
        err,
      });
      return false;
    }
  });
}

export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const metadata = await withWhatsAppMediaTimeout(async (signal) => {
      const urlRes = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        },
      );
      if (!urlRes.ok) return null;
      return (await urlRes.json()) as {
        url?: unknown;
        mime_type?: unknown;
        file_size?: unknown;
      };
    });
    if (!metadata) return null;
    const url = typeof metadata.url === "string" ? metadata.url.trim() : "";
    const mimeType =
      typeof metadata.mime_type === "string" ? metadata.mime_type.trim() : "";
    if (!url || !mimeType) return null;

    const maxBytes = getMediaMaxBytes(mimeType);
    if (
      isTrustedByteLength(metadata.file_size) &&
      metadata.file_size > maxBytes
    ) {
      whatsappLogger.warn(
        "media.declared_size_exceeded",
        "Media is too large",
        {
          declaredBytes: metadata.file_size,
          maxBytes,
        },
      );
      return null;
    }

    const buffer = await withWhatsAppMediaTimeout(async (signal) => {
      const binRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!binRes.ok) return null;
      return readBoundedResponseBody(binRes, maxBytes);
    });
    if (!buffer?.length) return null;

    return { base64: buffer.toString("base64"), mimeType };
  } catch {
    whatsappLogger.error("media.download_failed", "Media download failed", {
      timeoutMs: WHATSAPP_MEDIA_TIMEOUT_MS,
    });
    return null;
  }
}
