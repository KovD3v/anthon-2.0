import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Prisma } from "@/generated/prisma";
import {
  claimChannelConnectDelivery,
  getExternalInboundMessageType,
  markChannelConnectDeliveryFailed,
  markChannelConnectDeliverySent,
  markExternalChannelInboundCompleted,
  markExternalChannelInboundFailed,
  prepareChannelConnectRequest,
  prepareExternalChannelInbound,
  runChannelFlow,
} from "@/lib/channel-flow";
import { buildExternalChannelInbound } from "@/lib/channel-flow/inbound";
import { formatExternalRateLimitMessage } from "@/lib/channel-flow/rate-limit-message";
import type { ChannelMessagePart } from "@/lib/channel-flow/types";
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
import { createLogger } from "@/lib/logger";

const telegramLogger = createLogger("webhook");

const CONNECT_DELIVERY_TIMEOUT_MS = 45_000;

import {
  detectVoiceRequestIntent,
  generateVoice,
  getSystemLoad,
  getVoicePlanConfig,
  getVoiceUnavailability,
  isElevenLabsConfigured,
  shouldGenerateVoice,
  trackVoiceUsage,
} from "@/lib/voice";

/** @lintignore */
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

async function recordTelegramInboundError({
  inboundId,
  update,
  chatId,
  fromId,
  message,
  kind,
  summary,
}: {
  inboundId: string;
  update: TelegramUpdate;
  chatId: number;
  fromId: number;
  message: TelegramUpdate["message"];
  kind: string;
  summary?: string;
}) {
  await prisma.message
    .update({
      where: { id: inboundId },
      data: {
        metadata: {
          telegram: {
            updateId: update.update_id,
            chatId,
            fromId,
            username: message?.from?.username,
            languageCode: message?.from?.language_code,
            documentName: message?.document?.file_name,
            documentMimeType: message?.document?.mime_type,
            error: {
              kind,
              ...(summary ? { summary } : {}),
            },
          },
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);
}

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
      telegramLogger.error(
        "handler.background_error",
        "Background handler error",
        { err },
      );
    }),
  );

  return Response.json({ ok: true });
}

function createTelegramConnectToken(externalMessageId: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return null;

  return createHmac("sha256", secret)
    .update(`tg-connect:${externalMessageId}`)
    .digest("hex");
}

function telegramConnectResponse(
  responseKind: "LINK" | "ALREADY_LINKED" | "UNAVAILABLE",
  externalMessageId: string,
) {
  if (responseKind === "ALREADY_LINKED") {
    return "Il tuo account Telegram è già collegato al tuo profilo. Puoi gestire i canali collegati dalla pagina del tuo account.";
  }

  if (responseKind === "UNAVAILABLE") {
    return "Non riesco a generare il link di collegamento in questo momento. Riprova più tardi.";
  }

  const rawToken = createTelegramConnectToken(externalMessageId);
  if (!rawToken) {
    return "Non riesco a generare il link di collegamento in questo momento. Riprova più tardi.";
  }

  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  const linkUrl = `${baseUrl}/link/telegram/${rawToken}`;
  return `Per collegare Telegram al tuo profilo, apri questo link:\n${linkUrl}\n\nSe non sei loggato, ti verrà chiesto di accedere o registrarti e poi il canale verrà collegato automaticamente.`;
}

async function handleTelegramConnectCommand({
  externalMessageId,
  externalId,
  chatId,
}: {
  externalMessageId: string;
  externalId: string;
  chatId: number;
}) {
  const rawToken = createTelegramConnectToken(externalMessageId);
  const connectRequest = await prepareChannelConnectRequest({
    channel: "TELEGRAM",
    externalMessageId,
    externalId,
    chatId: String(chatId),
    tokenHash: rawToken ? hashLinkToken(rawToken) : null,
  }).catch((error) => {
    telegramLogger.error(
      "connect.claim_failed",
      "Failed to create Telegram connect claim",
      { error, externalMessageId },
    );
    return null;
  });

  if (!connectRequest) return;

  let claimToken: string | null;
  try {
    claimToken = await claimChannelConnectDelivery(connectRequest.id);
    if (!claimToken) return;
  } catch (error) {
    telegramLogger.error(
      "connect.delivery_claim_failed",
      "Failed to claim Telegram connect delivery",
      { error, connectRequestId: connectRequest.id },
    );
    return;
  }

  try {
    const sent = await sendTelegramMessage(
      chatId,
      telegramConnectResponse(connectRequest.responseKind, externalMessageId),
      AbortSignal.timeout(CONNECT_DELIVERY_TIMEOUT_MS),
    );
    if (!sent) throw new Error("Telegram connect response was not accepted");

    await markChannelConnectDeliverySent({
      connectRequestId: connectRequest.id,
      claimToken,
    });
  } catch (error) {
    await markChannelConnectDeliveryFailed({
      connectRequestId: connectRequest.id,
      claimToken,
      error,
    }).catch((markError) => {
      telegramLogger.error(
        "connect.delivery_failure_unrecorded",
        "Failed to record Telegram connect delivery failure",
        { markError, connectRequestId: connectRequest.id },
      );
    });
  }
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

  // `/connect` has no user yet, so it uses its own durable provider-message
  // claim instead of the Message table's user-bound idempotency marker.
  if (text && isTelegramConnectCommand(text)) {
    await handleTelegramConnectCommand({
      externalMessageId,
      externalId: String(fromId),
      chatId,
    });
    return;
  }

  const externalId = String(fromId);
  const preparedInbound = await prepareExternalChannelInbound({
    channel: "TELEGRAM",
    externalId,
    externalThreadId: String(chatId),
    externalMessageId,
    messageType: getExternalInboundMessageType({
      hasImage: hasPhoto,
      hasDocument,
      hasAudio: hasAudioMessage,
    }),
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
    buildGuestUserData: () => ({ isGuest: true }),
    scheduleBackground: safeWaitUntil,
    onFunnelTrackingError: (error) => {
      telegramLogger.error("funnel.tracking_failed", "Funnel tracking failed", {
        error,
      });
    },
  });

  if (preparedInbound.status === "duplicate") {
    return;
  }

  const { user, conversationThread, inbound, rateLimit, claimToken } =
    preparedInbound;
  const completeInbound = () =>
    markExternalChannelInboundCompleted({
      inboundId: inbound.id,
      claimToken,
    });
  const failInbound = (error: unknown) =>
    markExternalChannelInboundFailed({
      inboundId: inbound.id,
      claimToken,
      error,
    });

  try {
    if (!rateLimit.allowed) {
      await recordTelegramInboundError({
        inboundId: inbound.id,
        update,
        chatId,
        fromId,
        message,
        kind: "rate_limit_denied",
      });
      const sent = await sendTelegramMessage(
        chatId,
        formatExternalRateLimitMessage(rateLimit.upgradeInfo),
      );
      if (sent) await completeInbound();
      else await failInbound("rate_limit_response_send_failed");
      return;
    }

    if (process.env.TELEGRAM_DISABLE_AI === "true") {
      await completeInbound();
      return;
    }

    if (!process.env.OPENROUTER_API_KEY) {
      await recordTelegramInboundError({
        inboundId: inbound.id,
        update,
        chatId,
        fromId,
        message,
        kind: "ai_configuration_missing",
      });
      await sendTelegramMessage(
        chatId,
        "Servizio AI non configurato. Riprova più tardi.",
      );
      await failInbound("ai_configuration_missing");
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
        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "audio_download_failed",
        });

        await sendTelegramMessage(
          chatId,
          "Non sono riuscito a scaricare il messaggio audio. Riprova.",
        );
        await failInbound("audio_download_failed");
        return;
      }

      try {
        transcribedText = await transcribeAudioWithOpenRouter({
          ...audioData,
          title: "Telegram Bot",
          userId: user.id,
          source: "TELEGRAM",
        });
      } catch (err) {
        telegramLogger.error("transcription.failed", "Transcription failed", {
          err,
        });

        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "transcription_failed",
          summary: safeErrorSummary(err),
        });

        await sendTelegramMessage(
          chatId,
          "Non sono riuscito a trascrivere l'audio in questo momento. Riprova.",
        );
        await failInbound(err);
        return;
      }

      if (!transcribedText || transcribedText.trim().length === 0) {
        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "empty_transcription",
        });

        await sendTelegramMessage(
          chatId,
          "Non sono riuscito a trascrivere l'audio. Prova a reinviare il messaggio.",
        );
        await failInbound("empty_transcription");
        return;
      }
    }

    const files: ChannelMessagePart[] = [];

    // Download and add photo if present
    let downloadedPhoto = false;
    if (hasPhoto && message?.photo) {
      try {
        const photoData = await downloadTelegramPhoto(message.photo);
        if (!photoData) {
          await recordTelegramInboundError({
            inboundId: inbound.id,
            update,
            chatId,
            fromId,
            message,
            kind: "photo_download_failed",
          });
          await sendTelegramMessage(
            chatId,
            "Non sono riuscito a scaricare l'immagine. Riprova.",
          );
          await failInbound("photo_download_failed");
          return;
        }
        files.push({
          type: "file",
          mimeType: photoData.mimeType,
          data: photoData.base64,
        });
        downloadedPhoto = true;
      } catch (err) {
        telegramLogger.error(
          "media.photo_download_failed",
          "Failed to download photo",
          { err },
        );
        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "photo_download_failed",
          summary: safeErrorSummary(err),
        });
        await sendTelegramMessage(
          chatId,
          "Non sono riuscito a scaricare l'immagine. Riprova.",
        );
        await failInbound(err);
        return;
      }
    }

    // Download and add document if present
    if (hasDocument && message?.document) {
      try {
        const docData = await downloadTelegramDocument(message.document);
        if (!docData) {
          await recordTelegramInboundError({
            inboundId: inbound.id,
            update,
            chatId,
            fromId,
            message,
            kind: "document_download_failed",
          });
          await sendTelegramMessage(
            chatId,
            "Non sono riuscito a scaricare il documento. Riprova.",
          );
          await failInbound("document_download_failed");
          return;
        }
        if (!text && docData.fileName) {
          files.unshift({
            type: "text",
            text: `L'utente ha inviato il file: ${docData.fileName}`,
          });
        }
        files.push({
          type: "file",
          mimeType: docData.mimeType,
          data: docData.base64,
        });
      } catch (err) {
        telegramLogger.error(
          "media.document_download_failed",
          "Failed to download document",
          { err },
        );
        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "document_download_failed",
          summary: safeErrorSummary(err),
        });
        await sendTelegramMessage(
          chatId,
          "Non sono riuscito a scaricare il documento. Riprova.",
        );
        await failInbound(err);
        return;
      }
    }

    const { userMessageText, parts: messageParts } =
      buildExternalChannelInbound({
        text,
        transcribedText,
        voiceInstruction: transcribedText
          ? "NOTA: l'utente ha inviato un messaggio vocale. Puoi comprenderlo e rispondere usando la TRASCRIZIONE qui sotto. Non dire che non puoi ascoltare i vocali."
          : null,
        fallbackText: hasAudioMessage
          ? "Messaggio vocale"
          : hasPhoto
            ? "Immagine"
            : "Documento",
        defaultMediaPrompt: hasPhoto
          ? "L'utente ha inviato questa immagine."
          : "L'utente ha inviato questo file.",
        files,
      });

    // Generate assistant response.
    let assistantText = "";
    let assistantMessageId: string | undefined;

    try {
      const flowResult = await runChannelFlow({
        channel: "TELEGRAM",
        userId: user.id,
        conversationThreadId: conversationThread.id,
        userMessageId: inbound.id,
        userMessageText:
          userMessageText || (hasPhoto ? "Immagine" : "Documento"),
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
          inputOrigin: transcribedText
            ? "transcribed_voice"
            : downloadedPhoto || hasDocument
              ? "direct_media"
              : "text",
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
      assistantMessageId = flowResult.persistence?.messageId;
      if (flowResult.persistence?.status === "failed") {
        await recordTelegramInboundError({
          inboundId: inbound.id,
          update,
          chatId,
          fromId,
          message,
          kind: "assistant_persistence_failed",
          summary: safeErrorSummary(flowResult.persistence.error),
        });
        await sendTelegramMessage(
          chatId,
          "Errore temporaneo. Riprova tra qualche secondo.",
        );
        await failInbound(flowResult.persistence.error);
        return;
      }
    } catch (err) {
      telegramLogger.error("chat.stream_failed", "streamChat failed", { err });

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
      await failInbound(err);
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
      await failInbound("empty_assistant_response");
      return;
    }

    // Voice generation decision
    let voiceFallbackNotice: string | undefined;
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
          channel: "TELEGRAM",
          excludeMessageId: assistantMessageId,
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

        telegramLogger.info(
          "voice.delivery_decision",
          "Resolved Telegram voice delivery",
          {
            userId: user.id,
            category: voiceResult.category,
            capacityState: voiceResult.capacityState,
            reasonCode: voiceResult.reasonCode,
            shouldGenerateVoice: voiceResult.shouldGenerateVoice,
          },
        );

        if (voiceResult.shouldGenerateVoice) {
          const audio = await generateVoice(assistantText);
          const voiceSent = await LatencyLogger.measure(
            "Voice: Telegram Send",
            async () => sendTelegramVoice(chatId, audio.audioBuffer),
          );
          if (voiceSent) {
            if (assistantMessageId) {
              await prisma.message
                .update({
                  where: { id: assistantMessageId },
                  data: { type: "AUDIO", mediaType: "audio/mpeg" },
                })
                .catch((error) =>
                  telegramLogger.error(
                    "voice.persistence_update_failed",
                    "Failed marking Telegram response as audio",
                    { error, userId: user.id, messageId: assistantMessageId },
                  ),
                );
            }
            await trackVoiceUsage(
              user.id,
              audio.characterCount,
              "TELEGRAM",
              audio.costUsd,
            ).catch((error) =>
              telegramLogger.error(
                "voice.usage_tracking_failed",
                "Failed tracking Telegram voice usage",
                { error, userId: user.id },
              ),
            );
            await completeInbound();
            return;
          }
          if (voiceResult.explicitVoiceRequest) {
            voiceFallbackNotice = getVoiceUnavailability(
              "PROVIDER_UNAVAILABLE",
            ).userMessage;
          }
        } else if (voiceResult.explicitVoiceRequest) {
          voiceFallbackNotice = voiceResult.unavailability?.userMessage;
        }
      } catch (err) {
        telegramLogger.error(
          "voice.generation_failed",
          "Voice generation failed",
          { err },
        );
        // Fallback to text on any voice error
        if (detectVoiceRequestIntent(userMessageText) === "VOICE") {
          voiceFallbackNotice = getVoiceUnavailability(
            "PROVIDER_UNAVAILABLE",
          ).userMessage;
        }
      }
    } else if (detectVoiceRequestIntent(userMessageText) === "VOICE") {
      voiceFallbackNotice = getVoiceUnavailability(
        "PROVIDER_UNAVAILABLE",
      ).userMessage;
    }

    const sent = await sendTelegramMessage(
      chatId,
      voiceFallbackNotice
        ? `${voiceFallbackNotice}\n\n${assistantText}`
        : assistantText,
    );
    // If the provider accepted the response but the acknowledgement was lost,
    // a retry can send it again; automatic resend reconciliation is out of scope.
    if (sent) await completeInbound();
    else await failInbound("outbound_send_failed");
  } catch (error) {
    await failInbound(error);
    throw error;
  }
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (process.env.TELEGRAM_DISABLE_SEND === "true") {
    return true;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error(
      "config.missing_token",
      "TELEGRAM_BOT_TOKEN not configured",
    );
    return false;
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
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    telegramLogger.error("send.message_failed", "sendMessage failed", {
      status: res.status,
      body,
    });
    return false;
  }

  return true;
}

/**
 * Send a voice message to a Telegram chat.
 */
async function sendTelegramVoice(
  chatId: number,
  audioBuffer: Buffer,
): Promise<boolean> {
  if (process.env.TELEGRAM_DISABLE_SEND === "true") {
    return false;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramLogger.error(
      "config.missing_token",
      "TELEGRAM_BOT_TOKEN not configured",
    );
    return false;
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
    telegramLogger.error("send.voice_failed", "sendVoice failed", {
      status: res.status,
      body,
    });
    return false;
  }

  return true;
}
