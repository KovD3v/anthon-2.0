import { createHash, randomBytes } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { streamChat } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { checkRateLimit, incrementUsage } from "@/lib/rate-limit";
import {
  generateVoice,
  getSystemLoad,
  getVoicePlanConfig,
  isElevenLabsConfigured,
  shouldGenerateVoice,
  trackVoiceUsage,
} from "@/lib/voice";

export const runtime = "nodejs";

function safeWaitUntil(promise: Promise<unknown>) {
  try {
    waitUntil(promise);
  } catch {
    void promise;
  }
}

function safeErrorSummary(err: unknown) {
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

type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

type TelegramAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    voice?: TelegramVoice;
    audio?: TelegramAudio;
    photo?: TelegramPhotoSize[];
    document?: TelegramDocument;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat?: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

export async function GET() {
  return Response.json({ ok: true, channel: "telegram" });
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "TELEGRAM_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!headerSecret || headerSecret !== secret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // For local/dev testing, allow running the handler synchronously.
  if (process.env.TELEGRAM_SYNC_WEBHOOK === "true") {
    await handleUpdate(update);
    return Response.json({ ok: true });
  }

  // Acknowledge ASAP; do the heavy work in background.
  safeWaitUntil(
    handleUpdate(update).catch((err) => {
      console.error("[Telegram Webhook] Background handler error:", err);
    }),
  );

  return Response.json({ ok: true });
}

async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  const fromId = message?.from?.id;
  const chatId = message?.chat?.id;
  const telegramMessageId = message?.message_id;

  if (!fromId || !chatId || !telegramMessageId) {
    return;
  }

  // Extract text (either direct text or caption for audio/photo messages)
  const text = message?.text?.trim() || message?.caption?.trim();

  // Check for voice/audio messages
  const hasVoice = !!message?.voice;
  const hasAudio = !!message?.audio;
  const hasAudioMessage = hasVoice || hasAudio;

  // Check for photo/document messages
  const hasPhoto = !!message?.photo && message.photo.length > 0;
  const hasDocument = !!message?.document;
  const hasMediaAttachment = hasPhoto || hasDocument;

  // Require either text, audio, or media attachment
  if (!text && !hasAudioMessage && !hasMediaAttachment) {
    return;
  }

  const externalMessageId = `${chatId}:${telegramMessageId}`;

  // Idempotency: Telegram can retry webhooks.
  const existing = await prisma.message.findFirst({
    where: {
      channel: "TELEGRAM",
      externalMessageId,
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  // Non-tech linking flow: user asks the bot to connect their profile.
  if (text && isTelegramConnectCommand(text)) {
    const externalId = String(fromId);

    // Check if user is already connected to a non-guest account
    const existingIdentity = await prisma.channelIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: "TELEGRAM",
          externalId,
        },
      },
      select: {
        user: {
          select: {
            isGuest: true,
          },
        },
      },
    });

    // If connected to a non-guest user, inform them they're already connected
    if (existingIdentity?.user && !existingIdentity.user.isGuest) {
      await sendTelegramMessage(
        chatId,
        "Il tuo account Telegram è già collegato al tuo profilo. Puoi gestire i canali collegati dalla pagina del tuo account.",
      );
      return;
    }

    const linkUrl = await createTelegramLinkUrl(externalId, String(chatId));
    if (!linkUrl) {
      await sendTelegramMessage(
        chatId,
        "Non riesco a generare il link di collegamento in questo momento. Riprova più tardi.",
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `Per collegare Telegram al tuo profilo, apri questo link:\n${linkUrl}\n\nSe non sei loggato, ti verrà chiesto di accedere o registrarti e poi il canale verrà collegato automaticamente.`,
    );
    return;
  }

  const externalId = String(fromId);

  // Resolve / create user for this Telegram identity.
  const identity = await prisma.channelIdentity.findUnique({
    where: {
      channel_externalId: {
        channel: "TELEGRAM",
        externalId,
      },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          role: true,
          isGuest: true,
          subscription: {
            select: {
              status: true,
              planId: true,
            },
          },
        },
      },
    },
  });

  const user = identity?.user
    ? identity.user
    : await createGuestUserForTelegramIdentity(externalId);

  // Check rate limit (guest tier is stricter than trial).
  const rateLimit = await checkRateLimit(
    user.id,
    user.subscription?.status,
    user.role,
    user.subscription?.planId,
    user.isGuest,
  );

  if (!rateLimit.allowed) {
    // Use upgradeInfo for contextual CTA if available
    const upgradeInfo = rateLimit.upgradeInfo;
    let message: string;

    if (upgradeInfo) {
      const isGuest = upgradeInfo.currentPlan === "Ospite";
      message = isGuest
        ? `${upgradeInfo.ctaMessage}\n\nRegistrati qui: https://anthon.ai/sign-up`
        : `${upgradeInfo.ctaMessage}\n\nVedi i piani: https://anthon.ai/pricing`;
    } else {
      message =
        "Limite giornaliero raggiunto. Registrati per sbloccare la prova gratuita e limiti più alti.\n\nhttps://anthon.ai/sign-up";
    }

    await sendTelegramMessage(chatId, message);
    return;
  }

  // Save inbound message.
  // Determine message type
  const messageType = hasPhoto
    ? "IMAGE"
    : hasDocument
      ? "DOCUMENT"
      : hasAudioMessage
        ? "AUDIO"
        : "TEXT";
  const defaultContent = hasPhoto
    ? "Foto"
    : hasDocument
      ? "Documento"
      : hasAudioMessage
        ? "Messaggio vocale"
        : "";
  const inbound = await prisma.message
    .create({
      data: {
        userId: user.id,
        channel: "TELEGRAM",
        direction: "INBOUND",
        role: "USER",
        type: messageType,
        content: text || defaultContent,
        externalMessageId,
        metadata: {
          telegram: {
            updateId: update.update_id,
            chatId,
            fromId,
            username: message?.from?.username,
            languageCode: message?.from?.language_code,
            hasVoice: hasVoice || undefined,
            hasAudio: hasAudio || undefined,
            hasPhoto: hasPhoto || undefined,
            hasDocument: hasDocument || undefined,
            documentName: message?.document?.file_name,
            documentMimeType: message?.document?.mime_type,
          },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    .catch((err: unknown) => {
      // Race-safe idempotency: if Telegram retries quickly, rely on DB uniqueness.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return null;
      }
      throw err;
    });

  if (!inbound) {
    return;
  }

  if (process.env.TELEGRAM_DISABLE_AI === "true") {
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    await sendTelegramMessage(
      chatId,
      "Servizio AI non configurato. Riprova più tardi.",
    );
    return;
  }

  // If Telegram provides voice/audio, transcribe it BEFORE calling streamChat.
  // OpenRouter/Vercel AI SDK accept TEXT-only input.
  let transcribedText: string | null = null;
  if (hasAudioMessage) {
    const audioData = await downloadTelegramAudio(
      message?.voice,
      message?.audio,
    );
    if (!audioData) {
      await sendTelegramMessage(
        chatId,
        "Non sono riuscito a scaricare il messaggio audio. Riprova.",
      );
      return;
    }

    try {
      transcribedText = await transcribeWithOpenRouterResponses(audioData);
    } catch (err) {
      console.error("[Telegram Webhook] Transcription failed:", err);

      await prisma.message
        .update({
          where: { id: inbound.id },
          data: {
            metadata: {
              telegram: {
                updateId: update.update_id,
                chatId,
                fromId,
                username: message?.from?.username,
                languageCode: message?.from?.language_code,
                error: {
                  kind: "transcription_failed",
                  summary: safeErrorSummary(err),
                },
              },
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);

      await sendTelegramMessage(
        chatId,
        "Non sono riuscito a trascrivere l'audio in questo momento. Riprova.",
      );
      return;
    }

    if (!transcribedText || transcribedText.trim().length === 0) {
      await sendTelegramMessage(
        chatId,
        "Non sono riuscito a trascrivere l'audio. Prova a reinviare il messaggio.",
      );
      return;
    }
  }

  // Determine the user message for context (pure text; include transcription as text).
  const voiceInstruction = transcribedText
    ? "NOTA: l'utente ha inviato un messaggio vocale. Puoi comprenderlo e rispondere usando la TRASCRIZIONE qui sotto. Non dire che non puoi ascoltare i vocali."
    : null;

  const userMessageText = text
    ? transcribedText
      ? `${text}\n\n${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`
      : text
    : transcribedText
      ? `${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`
      : "Messaggio vocale";

  // Build message parts for the AI - can now include photos/documents.
  type MessagePart =
    | { type: "text"; text: string }
    | { type: "file"; mimeType: string; data: string };

  const messageParts: MessagePart[] = [];

  // Add text if present
  if (userMessageText) {
    messageParts.push({ type: "text", text: userMessageText });
  }

  // Download and add photo if present
  let downloadedPhoto = false;
  if (hasPhoto && message?.photo) {
    try {
      const photoData = await downloadTelegramPhoto(message.photo);
      if (photoData) {
        messageParts.push({
          type: "file",
          mimeType: photoData.mimeType,
          data: photoData.base64,
        });
        downloadedPhoto = true;
      }
    } catch (err) {
      console.error("[Telegram Webhook] Failed to download photo:", err);
    }
  }

  // Download and add document if present
  if (hasDocument && message?.document) {
    try {
      const docData = await downloadTelegramDocument(message.document);
      if (docData) {
        messageParts.push({
          type: "file",
          mimeType: docData.mimeType,
          data: docData.base64,
        });
        // Add context about the document name if no caption
        if (!text && docData.fileName) {
          messageParts.unshift({
            type: "text",
            text: `L'utente ha inviato il file: ${docData.fileName}`,
          });
        }
      }
    } catch (err) {
      console.error("[Telegram Webhook] Failed to download document:", err);
    }
  }

  // Add default prompt for media-only messages
  if (messageParts.length > 0 && !messageParts.some((p) => p.type === "text")) {
    messageParts.unshift({
      type: "text",
      text: hasPhoto
        ? "L'utente ha inviato questa immagine."
        : "L'utente ha inviato questo file.",
    });
  }

  // Generate assistant response.
  let assistantText = "";

  try {
    const result = await streamChat({
      userId: user.id,
      userMessage: userMessageText || (hasPhoto ? "Immagine" : "Documento"),
      planId: user.subscription?.planId,
      userRole: user.role,
      subscriptionStatus: user.subscription?.status,
      isGuest: user.isGuest,
      // Telegram audio is transcribed before calling the AI, so the AI receives text-only input.
      // Setting hasAudio=false prevents audio-specific prompting that can cause the model
      // to reply that it cannot listen to voice notes.
      hasAudio: false,
      hasImages: downloadedPhoto, // Enable vision model when photos are present
      messageParts: messageParts as Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
      }>,
      effectiveEntitlements: rateLimit.effectiveEntitlements,
      onFinish: async ({ text: finalText, metrics }) => {
        if (!finalText || finalText.trim().length === 0) return;

        await prisma.message
          .create({
            data: {
              userId: user.id,
              channel: "TELEGRAM",
              direction: "OUTBOUND",
              role: "ASSISTANT",
              type: "TEXT",
              content: finalText,
              parts: [
                { type: "text", text: finalText },
              ] as Prisma.InputJsonValue,
              metadata: {
                telegram: {
                  inReplyTo: inbound.id,
                  chatId,
                },
              } as Prisma.InputJsonValue,
              model: metrics.model,
              inputTokens: metrics.inputTokens,
              outputTokens: metrics.outputTokens,
              reasoningTokens: metrics.reasoningTokens,
              reasoningContent: metrics.reasoningContent,
              toolCalls: metrics.toolCalls as Prisma.InputJsonValue | undefined,
              ragUsed: metrics.ragUsed,
              ragChunksCount: metrics.ragChunksCount,
              costUsd: metrics.costUsd,
              generationTimeMs: metrics.generationTimeMs,
              reasoningTimeMs: metrics.reasoningTimeMs,
            },
          })
          .catch((err) => {
            console.error(
              "[Telegram Webhook] Failed to save assistant message:",
              err,
            );
          });

        await incrementUsage(
          user.id,
          metrics.inputTokens,
          metrics.outputTokens,
          metrics.costUsd,
        ).catch((err) => {
          console.error("[Telegram Webhook] Failed to increment usage:", err);
        });

        safeWaitUntil(
          extractAndSaveMemories(user.id, userMessageText, finalText).catch(
            (err) => {
              console.error("[Telegram Webhook] Memory extraction error:", err);
            },
          ),
        );
      },
    });

    for await (const chunk of result.textStream) {
      assistantText += chunk;
    }
  } catch (err) {
    console.error("[Telegram Webhook] streamChat failed:", err);

    await prisma.message
      .update({
        where: { id: inbound.id },
        data: {
          metadata: {
            telegram: {
              updateId: update.update_id,
              chatId,
              fromId,
              username: message?.from?.username,
              languageCode: message?.from?.language_code,
              error: {
                kind: "streamChat_failed",
                summary: safeErrorSummary(err),
              },
            },
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    await sendTelegramMessage(
      chatId,
      "Errore temporaneo. Riprova tra qualche secondo.",
    );
    return;
  }

  if (assistantText.trim().length === 0) {
    await prisma.message
      .update({
        where: { id: inbound.id },
        data: {
          metadata: {
            telegram: {
              updateId: update.update_id,
              chatId,
              fromId,
              username: message?.from?.username,
              languageCode: message?.from?.language_code,
              error: {
                kind: "empty_assistant_response",
              },
            },
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    await sendTelegramMessage(
      chatId,
      "Non ho generato una risposta. Riprova tra qualche secondo.",
    );
    return;
  }

  // Voice generation decision
  if (isElevenLabsConfigured()) {
    try {
      // Fetch user preferences for voice
      const preferences = await prisma.preferences.findUnique({
        where: { userId: user.id },
        select: { voiceEnabled: true },
      });

      const voiceResult = await shouldGenerateVoice({
        userId: user.id,
        userMessage: userMessageText,
        assistantText,
        userPreferences: {
          voiceEnabled: preferences?.voiceEnabled ?? true,
        },
        planConfig: getVoicePlanConfig(
          user.subscription?.status,
          user.role,
          user.subscription?.planId,
          user.isGuest,
        ),
        systemLoad: getSystemLoad,
        planId: user.subscription?.planId,
      });

      if (voiceResult.shouldGenerateVoice) {
        const audio = await generateVoice(assistantText);
        await LatencyLogger.measure("Voice: Telegram Send", async () =>
          sendTelegramVoice(chatId, audio.audioBuffer),
        );
        await trackVoiceUsage(user.id, audio.characterCount, "TELEGRAM");
        return;
      }
    } catch (err) {
      console.error("[Telegram Webhook] Voice generation failed:", err);
      // Fallback to text on any voice error
    }
  }

  await sendTelegramMessage(chatId, assistantText);
}

function isTelegramConnectCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "/connect" ||
    normalized.startsWith("/connect ") ||
    normalized === "collega" ||
    normalized === "collega profilo" ||
    normalized === "collega account"
  );
}

function getPublicAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function hashLinkToken(token: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHash("sha256")
    .update(`tg-link:${secret}:${token}`)
    .digest("hex");
}

async function createTelegramLinkUrl(externalId: string, chatId: string) {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashLinkToken(rawToken);
  if (!tokenHash) return null;

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.channelLinkToken.create({
    data: {
      channel: "TELEGRAM",
      tokenHash,
      externalId,
      chatId,
      expiresAt,
    },
    select: { id: true },
  });

  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  return `${baseUrl}/link/telegram/${rawToken}`;
}

async function createGuestUserForTelegramIdentity(externalId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        isGuest: true,
      },
      select: {
        id: true,
        role: true,
        isGuest: true,
        subscription: {
          select: {
            status: true,
            planId: true,
          },
        },
      },
    });

    await tx.channelIdentity.upsert({
      where: {
        channel_externalId: {
          channel: "TELEGRAM",
          externalId,
        },
      },
      update: {
        userId: user.id,
      },
      create: {
        channel: "TELEGRAM",
        externalId,
        userId: user.id,
      },
      select: { id: true },
    });

    return user;
  });
}

async function sendTelegramMessage(chatId: number, text: string) {
  if (process.env.TELEGRAM_DISABLE_SEND === "true") {
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not configured");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Telegram] sendMessage failed:", res.status, body);
  }
}

/**
 * Send a voice message to a Telegram chat.
 */
async function sendTelegramVoice(chatId: number, audioBuffer: Buffer) {
  if (process.env.TELEGRAM_DISABLE_SEND === "true") {
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not configured");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendVoice`;

  // Create form data for file upload
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  formData.append(
    "voice",
    new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }),
    "voice.mp3",
  );

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Telegram] sendVoice failed:", res.status, body);
  }
}

/**
 * Get the file path for a Telegram file using getFile API.
 */
async function getTelegramFilePath(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not configured");
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(
      fileId,
    )}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Telegram] getFile failed:", res.status, body);
      return null;
    }

    const data = (await res.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!data.ok || !data.result?.file_path) {
      console.error("[Telegram] getFile returned no file_path:", data);
      return null;
    }

    return data.result.file_path;
  } catch (error) {
    console.error("[Telegram] Error getting file path:", error);
    return null;
  }
}

/**
 * Download a file from Telegram and return as base64.
 */
async function downloadTelegramFileAsBase64(
  filePath: string,
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not configured");
    return null;
  }

  try {
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Telegram] File download failed:", res.status, body);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return base64;
  } catch (error) {
    console.error("[Telegram] Error downloading file:", error);
    return null;
  }
}

/**
 * Download audio from Telegram voice/audio message.
 * Returns base64 data and mime type, or null if failed.
 */
async function downloadTelegramAudio(
  voice?: TelegramVoice,
  audio?: TelegramAudio,
): Promise<{ base64: string; mimeType: string } | null> {
  const fileId = voice?.file_id || audio?.file_id;
  if (!fileId) {
    return null;
  }

  // Voice messages are always OGG/Opus, audio files may vary
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

/**
 * Download photo from Telegram.
 * Gets the largest size available for better quality.
 * Returns base64 data and mime type, or null if failed.
 */
async function downloadTelegramPhoto(
  photos: TelegramPhotoSize[],
): Promise<{ base64: string; mimeType: string } | null> {
  if (!photos || photos.length === 0) {
    return null;
  }

  // Get the largest photo (last in array)
  const largestPhoto = photos[photos.length - 1];
  const filePath = await getTelegramFilePath(largestPhoto.file_id);
  if (!filePath) {
    return null;
  }

  const base64 = await downloadTelegramFileAsBase64(filePath);
  if (!base64) {
    return null;
  }

  // Telegram photos are always JPEG
  return { base64, mimeType: "image/jpeg" };
}

/**
 * Download document from Telegram.
 * Returns base64 data and mime type, or null if failed.
 */
async function downloadTelegramDocument(
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

async function transcribeWithOpenRouterResponses(audio: {
  base64: string;
  mimeType: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  // Creiamo il Data URI standard
  const dataUri = `data:${audio.mimeType};base64,${audio.base64}`;

  // Usiamo l'endpoint chat/completions standard
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // A volte OpenRouter richiede questo header per instradare correttamente i siti
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Telegram Bot",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-lite-001",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Trascrivi questo messaggio audio in testo. Rispondi SOLO con la trascrizione, senza commenti.",
            },
            {
              // TRUCCO: Usiamo 'image_url' per passare il file base64.
              // OpenRouter capirà dal mime-type (audio/ogg) che è un audio
              // e lo passerà correttamente a Gemini.
              type: "image_url",
              image_url: {
                url: dataUri,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenRouter returned no text output");
  }

  return text;
}

export const __testables = {
  safeErrorSummary,
  isTelegramConnectCommand,
  getPublicAppUrl,
  hashLinkToken,
  getTelegramFilePath,
  downloadTelegramFileAsBase64,
  downloadTelegramAudio,
  downloadTelegramPhoto,
  downloadTelegramDocument,
  transcribeWithOpenRouterResponses,
};
