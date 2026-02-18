import { randomBytes } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Prisma } from "@/generated/prisma";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import { runChannelFlow } from "@/lib/channel-flow";
import {
  downloadTelegramAudio,
  downloadTelegramDocument,
  downloadTelegramPhoto,
  getPublicAppUrl,
  hashLinkToken,
  isTelegramConnectCommand,
  safeErrorSummary,
  type TelegramAudio,
  type TelegramDocument,
  type TelegramPhotoSize,
  type TelegramVoice,
} from "@/lib/channels/telegram/utils";
import { transcribeAudioWithOpenRouter } from "@/lib/channels/transcription/openrouter";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { checkRateLimit } from "@/lib/rate-limit";
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

export async function handleTelegramWebhookGet() {
  return Response.json({ ok: true, channel: "telegram" });
}

export async function handleTelegramWebhookPost(request: Request) {
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

  let messageType: "IMAGE" | "DOCUMENT" | "AUDIO" | "TEXT";
  let defaultContent: string;

  if (hasPhoto) {
    messageType = "IMAGE";
    defaultContent = "Foto";
  } else if (hasDocument) {
    messageType = "DOCUMENT";
    defaultContent = "Documento";
  } else if (hasAudioMessage) {
    messageType = "AUDIO";
    defaultContent = "Messaggio vocale";
  } else {
    messageType = "TEXT";
    defaultContent = "";
  }
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

  safeWaitUntil(
    trackInboundUserMessageFunnelProgress({
      userId: user.id,
      isGuest: user.isGuest,
      userRole: user.role,
      channel: "TELEGRAM",
      planId: user.subscription?.planId,
      subscriptionStatus: user.subscription?.status,
    }).catch((error) => {
      console.error("[Telegram Webhook] Funnel tracking failed:", error);
    }),
  );

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
      transcribedText = await transcribeAudioWithOpenRouter({
        ...audioData,
        title: "Telegram Bot",
      });
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

  let userMessageText: string;
  if (text && transcribedText) {
    userMessageText = `${text}\n\n${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`;
  } else if (text) {
    userMessageText = text;
  } else if (transcribedText) {
    userMessageText = `${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`;
  } else {
    userMessageText = "Messaggio vocale";
  }

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
    const flowResult = await runChannelFlow({
      channel: "TELEGRAM",
      userId: user.id,
      userMessageText: userMessageText || (hasPhoto ? "Immagine" : "Documento"),
      parts: messageParts,
      rateLimit: {
        allowed: rateLimit.allowed,
        effectiveEntitlements: rateLimit.effectiveEntitlements,
        upgradeInfo: rateLimit.upgradeInfo,
      },
      options: {
        allowAttachments: true,
        allowMemoryExtraction: true,
        allowVoiceOutput: true,
      },
      ai: {
        planId: user.subscription?.planId,
        userRole: user.role,
        subscriptionStatus: user.subscription?.status,
        isGuest: user.isGuest,
        hasAudio: false,
        hasImages: downloadedPhoto,
      },
      execution: { mode: "text" },
      persistence: {
        channel: "TELEGRAM",
        metadata: {
          telegram: {
            inReplyTo: inbound.id,
            chatId,
          },
        } as Prisma.InputJsonValue,
        saveAssistantMessage: true,
        waitUntil: safeWaitUntil,
      },
    });
    assistantText = flowResult.assistantText;
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
