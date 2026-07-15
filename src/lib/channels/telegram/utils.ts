import { createHash } from "node:crypto";
import { createLogger } from "@/lib/logger";

const telegramLogger = createLogger("webhook");

// Raw download budgets only. Base64/downstream limits remain separate, and
// every newly accepted media class must be assigned an explicit byte budget.
const TELEGRAM_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const TELEGRAM_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const TELEGRAM_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 10_000;

async function withTelegramDownloadTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TELEGRAM_DOWNLOAD_TIMEOUT_MS,
  );
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

export type TelegramAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export function safeErrorSummary(err: unknown) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err.slice(0, 300);
  if (err instanceof Error) {
    const msg = `${err.name}: ${err.message}`.trim();
    return msg.slice(0, 300);
  }
  try {
    return JSON.stringify(err).slice(0, 300);
  } catch {
    return "Unserializable error";
  }
}

export function isTelegramConnectCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "/connect" ||
    normalized.startsWith("/connect ") ||
    normalized === "collega" ||
    normalized === "collega profilo" ||
    normalized === "collega account"
  );
}

export function getPublicAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function hashLinkToken(token: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHash("sha256")
    .update(`tg-link:${secret}:${token}`)
    .digest("hex");
}

function isTrustedByteLength(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function isDeclaredFileTooLarge(
  declaredBytes: number | undefined,
  maxBytes: number,
): boolean {
  if (!isTrustedByteLength(declaredBytes) || declaredBytes <= maxBytes) {
    return false;
  }

  telegramLogger.warn("file.declared_size_exceeded", "File is too large", {
    declaredBytes,
    maxBytes,
  });
  return true;
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
    telegramLogger.warn("file.content_length_exceeded", "File is too large", {
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
        telegramLogger.warn("file.stream_size_exceeded", "File is too large", {
          receivedBytes: totalBytes,
          maxBytes,
        });
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function getTelegramFilePath(
  fileId: string,
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error(
      "config.missing_token",
      "TELEGRAM_BOT_TOKEN not configured",
    );
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(
      fileId,
    )}`;
    return await withTelegramDownloadTimeout(async (signal) => {
      const res = await fetch(url, { signal });

      if (!res.ok) {
        telegramLogger.error("file.get_failed", "getFile failed", {
          status: res.status,
        });
        return null;
      }

      const data = (await res.json()) as {
        ok: boolean;
        result?: { file_path?: string };
      };

      if (!data.ok || !data.result?.file_path) {
        telegramLogger.error("file.no_path", "getFile returned no file_path");
        return null;
      }

      return data.result.file_path;
    });
  } catch {
    telegramLogger.error("file.path_error", "Error getting file path", {
      timeoutMs: TELEGRAM_DOWNLOAD_TIMEOUT_MS,
    });
    return null;
  }
}

async function downloadTelegramFileAsBase64(
  filePath: string,
  maxBytes: number,
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error(
      "config.missing_token",
      "TELEGRAM_BOT_TOKEN not configured",
    );
    return null;
  }

  try {
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    return await withTelegramDownloadTimeout(async (signal) => {
      const res = await fetch(url, { signal });

      if (!res.ok) {
        telegramLogger.error("file.download_failed", "File download failed", {
          status: res.status,
        });
        return null;
      }

      const buffer = await readBoundedResponseBody(res, maxBytes);
      return buffer?.length ? buffer.toString("base64") : null;
    });
  } catch {
    telegramLogger.error("file.download_error", "Error downloading file", {
      timeoutMs: TELEGRAM_DOWNLOAD_TIMEOUT_MS,
    });
    return null;
  }
}

export async function downloadTelegramAudio(
  voice?: TelegramVoice,
  audio?: TelegramAudio,
): Promise<{ base64: string; mimeType: string } | null> {
  const fileId = voice?.file_id || audio?.file_id;
  if (!fileId) {
    return null;
  }

  const mimeType = voice?.mime_type || audio?.mime_type || "audio/ogg";
  const fileSize = voice?.file_size ?? audio?.file_size;
  if (isDeclaredFileTooLarge(fileSize, TELEGRAM_AUDIO_MAX_BYTES)) {
    return null;
  }

  const filePath = await getTelegramFilePath(fileId);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(
    filePath,
    TELEGRAM_AUDIO_MAX_BYTES,
  );
  if (!base64) {
    return null;
  }

  return { base64, mimeType };
}

export async function downloadTelegramPhoto(
  photos: TelegramPhotoSize[],
): Promise<{ base64: string; mimeType: string } | null> {
  if (!photos || photos.length === 0) {
    return null;
  }

  const largestPhoto = photos[photos.length - 1];
  if (
    isDeclaredFileTooLarge(largestPhoto.file_size, TELEGRAM_PHOTO_MAX_BYTES)
  ) {
    return null;
  }
  const filePath = await getTelegramFilePath(largestPhoto.file_id);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(
    filePath,
    TELEGRAM_PHOTO_MAX_BYTES,
  );
  if (!base64) {
    return null;
  }

  return { base64, mimeType: "image/jpeg" };
}

export async function downloadTelegramDocument(
  document: TelegramDocument,
): Promise<{ base64: string; mimeType: string; fileName?: string } | null> {
  if (isDeclaredFileTooLarge(document.file_size, TELEGRAM_DOCUMENT_MAX_BYTES)) {
    return null;
  }
  const filePath = await getTelegramFilePath(document.file_id);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(
    filePath,
    TELEGRAM_DOCUMENT_MAX_BYTES,
  );
  if (!base64) {
    return null;
  }

  return {
    base64,
    mimeType: document.mime_type || "application/octet-stream",
    fileName: document.file_name,
  };
}
