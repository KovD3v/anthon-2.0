import { createHash } from "node:crypto";
import { createLogger } from "@/lib/logger";

const telegramLogger = createLogger("webhook");

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
  return createHash("sha256").update(`tg-link:${secret}:${token}`).digest("hex");
}

export async function getTelegramFilePath(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error("config.missing_token", "TELEGRAM_BOT_TOKEN not configured");
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(
      fileId,
    )}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      telegramLogger.error("file.get_failed", "getFile failed", { status: res.status, body });
      return null;
    }

    const data = (await res.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!data.ok || !data.result?.file_path) {
      telegramLogger.error("file.no_path", "getFile returned no file_path", { data });
      return null;
    }

    return data.result.file_path;
  } catch (error) {
    telegramLogger.error("file.path_error", "Error getting file path", { error });
    return null;
  }
}

async function downloadTelegramFileAsBase64(
  filePath: string,
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error("config.missing_token", "TELEGRAM_BOT_TOKEN not configured");
    return null;
  }

  try {
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      telegramLogger.error("file.download_failed", "File download failed", { status: res.status, body });
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (error) {
    telegramLogger.error("file.download_error", "Error downloading file", { error });
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

  const filePath = await getTelegramFilePath(fileId);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(filePath);
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
  const filePath = await getTelegramFilePath(largestPhoto.file_id);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(filePath);
  if (!base64) {
    return null;
  }

  return { base64, mimeType: "image/jpeg" };
}

export async function downloadTelegramDocument(
  document: TelegramDocument,
): Promise<{ base64: string; mimeType: string; fileName?: string } | null> {
  const filePath = await getTelegramFilePath(document.file_id);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(filePath);
  if (!base64) {
    return null;
  }

  return {
    base64,
    mimeType: document.mime_type || "application/octet-stream",
    fileName: document.file_name,
  };
}
