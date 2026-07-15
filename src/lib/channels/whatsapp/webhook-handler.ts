import { createHash, createHmac } from "node:crypto";
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
import { transcribeAudioWithOpenRouter } from "@/lib/channels/transcription/openrouter";
import {
  downloadWhatsAppMedia,
  getPublicAppUrl,
  isConnectCommand,
  sendWhatsAppMessage,
  sendWhatsAppVoice,
  verifySignature,
} from "@/lib/channels/whatsapp/utils";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const whatsappLogger = createLogger("webhook");

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

// --- Types ---

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

type WhatsAppMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "voice" | "document" | "unknown";
  text?: { body: string };
  image?: {
    id: string;
    caption?: string;
    mime_type: string;
    sha256?: string;
  };
  audio?: { id: string; mime_type: string; voice?: boolean };
  voice?: { id: string; mime_type: string }; // Sometimes voice comes as voice type
  document?: {
    id: string;
    caption?: string;
    mime_type: string;
    filename: string;
  };
};

type WhatsAppChangeValue = {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: {
    profile: { name: string };
    wa_id: string;
  }[];
  messages?: WhatsAppMessage[];
};

type WhatsAppPayload = {
  object: "whatsapp_business_account";
  entry: {
    id: string;
    changes: {
      value: WhatsAppChangeValue;
      field: "messages";
    }[];
  }[];
};

// --- Helpers ---

function safeWaitUntil(promise: Promise<unknown>) {
  try {
    waitUntil(promise);
  } catch {
    void promise;
  }
}

async function recordWhatsAppInboundError({
  inboundId,
  message,
  context,
  kind,
  summary,
}: {
  inboundId: string;
  message: WhatsAppMessage;
  context: WhatsAppChangeValue;
  kind: string;
  summary?: string;
}) {
  await prisma.message
    .update({
      where: { id: inboundId },
      data: {
        metadata: {
          whatsapp: {
            id: message.id,
            timestamp: message.timestamp,
            type: message.type,
            name: context.contacts?.[0]?.profile?.name,
            documentName: message.document?.filename,
            documentMimeType: message.document?.mime_type,
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

// --- Main Handler ---

export async function handleWhatsAppWebhookGet(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function handleWhatsAppWebhookPost(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(request, rawBody)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle updates
  if (payload.object === "whatsapp_business_account") {
    // For local/dev, synchronous execution
    if (process.env.WHATSAPP_SYNC_WEBHOOK === "true") {
      await processPayload(payload);
      return Response.json({ ok: true });
    }

    // Async background execution
    safeWaitUntil(
      processPayload(payload).catch((err) => {
        whatsappLogger.error(
          "handler.background_error",
          "Background handler error",
          { err },
        );
      }),
    );

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Not Found" }, { status: 404 });
}

function createWhatsAppConnectToken(externalMessageId: string) {
  const secret = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!secret) return null;

  return createHmac("sha256", secret)
    .update(`wa-connect:${externalMessageId}`)
    .digest("hex");
}

function hashWhatsAppLinkToken(rawToken: string) {
  const secret = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!secret) return null;

  return createHash("sha256")
    .update(`wa-link:${secret}:${rawToken}`)
    .digest("hex");
}

function whatsAppConnectResponse(
  responseKind: "LINK" | "ALREADY_LINKED" | "UNAVAILABLE",
  externalMessageId: string,
) {
  if (responseKind === "ALREADY_LINKED") {
    return "Il tuo account è già collegato.";
  }

  if (responseKind === "UNAVAILABLE") {
    return "Non riesco a generare il link di collegamento in questo momento. Riprova più tardi.";
  }

  const rawToken = createWhatsAppConnectToken(externalMessageId);
  if (!rawToken) {
    return "Non riesco a generare il link di collegamento in questo momento. Riprova più tardi.";
  }

  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  return `Per collegare il tuo account, usa questo link:\n${baseUrl}/link/whatsapp/${rawToken}`;
}

async function handleConnectCommand({
  externalMessageId,
  from,
}: {
  externalMessageId: string;
  from: string;
}) {
  const rawToken = createWhatsAppConnectToken(externalMessageId);
  const connectRequest = await prepareChannelConnectRequest({
    channel: "WHATSAPP",
    externalMessageId,
    externalId: from,
    chatId: from,
    tokenHash: rawToken ? hashWhatsAppLinkToken(rawToken) : null,
  }).catch((error) => {
    whatsappLogger.error(
      "connect.claim_failed",
      "Failed to create WhatsApp connect claim",
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
    whatsappLogger.error(
      "connect.delivery_claim_failed",
      "Failed to claim WhatsApp connect delivery",
      { error, connectRequestId: connectRequest.id },
    );
    return;
  }

  try {
    const sent = await sendWhatsAppMessage(
      from,
      whatsAppConnectResponse(connectRequest.responseKind, externalMessageId),
      AbortSignal.timeout(CONNECT_DELIVERY_TIMEOUT_MS),
    );
    if (!sent) throw new Error("WhatsApp connect response was not accepted");

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
      whatsappLogger.error(
        "connect.delivery_failure_unrecorded",
        "Failed to record WhatsApp connect delivery failure",
        { markError, connectRequestId: connectRequest.id },
      );
    });
  }
}

async function processPayload(payload: WhatsAppPayload) {
  // We typically only care about the first entry/change/message for simplicity in this loop,
  // but let's iterate correctly.
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (
        change.field === "messages" &&
        change.value &&
        change.value.messages
      ) {
        for (const message of change.value.messages) {
          await handleMessage(message, change.value);
        }
      }
    }
  }
}

async function handleMessage(
  message: WhatsAppMessage,
  context: WhatsAppChangeValue,
) {
  const from = message.from; // Sender phone number (wa_id)
  const messageId = message.id; // WAMID

  // Skip status updates or unsupported types
  if (!from || !messageId) return;

  // Extract content
  let text = "";
  if (message.type === "text") {
    text = message.text?.body?.trim() || "";
  } else if (message.type === "image") {
    text = message.image?.caption?.trim() || "";
  } else if (message.type === "document") {
    text = message.document?.caption?.trim() || "";
  }

  const hasAudio = message.type === "audio" || message.type === "voice";
  const hasImage = message.type === "image";
  const hasDocument = message.type === "document";

  if (!text && !hasAudio && !hasImage && !hasDocument) {
    // Possibly a reaction or unsupported type
    return;
  }

  // `/connect` has no user yet, so it uses its own durable provider-message
  // claim instead of the Message table's user-bound idempotency marker.
  if (text && isConnectCommand(text)) {
    await handleConnectCommand({ externalMessageId: messageId, from });
    return;
  }

  const preparedInbound = await prepareExternalChannelInbound({
    channel: "WHATSAPP",
    externalId: from,
    externalThreadId: from,
    externalMessageId: messageId,
    messageType: getExternalInboundMessageType({
      hasImage,
      hasDocument,
      hasAudio,
    }),
    metadata: {
      whatsapp: {
        id: messageId,
        timestamp: message.timestamp,
        type: message.type,
        name: context.contacts?.[0]?.profile?.name,
      },
    } as Prisma.InputJsonValue,
    buildGuestUserData: () => buildWhatsAppGuestUserData(context),
    scheduleBackground: safeWaitUntil,
    onFunnelTrackingError: (error) => {
      whatsappLogger.error("funnel.tracking_failed", "Funnel tracking failed", {
        error,
      });
    },
  });

  if (preparedInbound.status === "duplicate") return;

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
      await recordWhatsAppInboundError({
        inboundId: inbound.id,
        message,
        context,
        kind: "rate_limit_denied",
      });
      const sent = await sendWhatsAppMessage(
        from,
        formatExternalRateLimitMessage(rateLimit.upgradeInfo),
      );
      if (sent) await completeInbound();
      else await failInbound("rate_limit_response_send_failed");
      return;
    }

    if (process.env.WHATSAPP_DISABLE_AI === "true") {
      await completeInbound();
      return;
    }

    if (!process.env.OPENROUTER_API_KEY) {
      await recordWhatsAppInboundError({
        inboundId: inbound.id,
        message,
        context,
        kind: "ai_configuration_missing",
      });
      await sendWhatsAppMessage(
        from,
        "Servizio AI non configurato. Riprova più tardi.",
      );
      await failInbound("ai_configuration_missing");
      return;
    }

    // Process Media (Audio, Image, Document)
    let transcribedText: string | null = null;
    const files: ChannelMessagePart[] = [];

    // --- Audio Transcription ---
    if (hasAudio) {
      const audioId = message.audio?.id || message.voice?.id;
      if (audioId) {
        const audioData = await downloadWhatsAppMedia(audioId);
        if (!audioData) {
          await recordWhatsAppInboundError({
            inboundId: inbound.id,
            message,
            context,
            kind: "audio_download_failed",
          });

          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a scaricare il messaggio audio. Riprova.",
          );
          await failInbound("audio_download_failed");
          return;
        }

        try {
          transcribedText = await transcribeAudioWithOpenRouter({
            ...audioData,
            title: "WhatsApp Bot",
            userId: user.id,
            source: "WHATSAPP",
          });
        } catch (err) {
          whatsappLogger.error("transcription.failed", "Transcription failed", {
            err,
          });
          await recordWhatsAppInboundError({
            inboundId: inbound.id,
            message,
            context,
            kind: "transcription_failed",
            summary: safeErrorSummary(err),
          });
          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a trascrivere il messaggio audio. Riprova.",
          );
          await failInbound(err);
          return;
        }

        if (!transcribedText || transcribedText.trim().length === 0) {
          await recordWhatsAppInboundError({
            inboundId: inbound.id,
            message,
            context,
            kind: "empty_transcription",
          });

          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a trascrivere l'audio. Prova a reinviare il messaggio.",
          );
          await failInbound("empty_transcription");
          return;
        }
      }
    }

    // --- Image Download ---
    let downloadedPhoto = false;
    if (hasImage && message.image?.id) {
      try {
        const imageData = await downloadWhatsAppMedia(message.image.id);
        if (!imageData) {
          await recordWhatsAppInboundError({
            inboundId: inbound.id,
            message,
            context,
            kind: "image_download_failed",
          });
          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a scaricare l'immagine. Riprova.",
          );
          await failInbound("image_download_failed");
          return;
        }
        files.push({
          type: "file",
          mimeType: imageData.mimeType,
          data: imageData.base64,
        });
        downloadedPhoto = true;
      } catch (err) {
        whatsappLogger.error(
          "media.image_download_failed",
          "Failed to download image",
          { err },
        );
        await recordWhatsAppInboundError({
          inboundId: inbound.id,
          message,
          context,
          kind: "image_download_failed",
          summary: safeErrorSummary(err),
        });
        await sendWhatsAppMessage(
          from,
          "Non sono riuscito a scaricare l'immagine. Riprova.",
        );
        await failInbound(err);
        return;
      }
    }

    // --- Document Download ---
    if (hasDocument && message.document?.id) {
      try {
        const docData = await downloadWhatsAppMedia(message.document.id);
        if (!docData) {
          await recordWhatsAppInboundError({
            inboundId: inbound.id,
            message,
            context,
            kind: "document_download_failed",
          });
          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a scaricare il documento. Riprova.",
          );
          await failInbound("document_download_failed");
          return;
        }
        if (!text && message.document.filename) {
          files.unshift({
            type: "text",
            text: `L'utente ha inviato il file: ${message.document.filename}`,
          });
        }
        files.push({
          type: "file",
          mimeType: docData.mimeType,
          data: docData.base64,
        });
      } catch (err) {
        whatsappLogger.error(
          "media.document_download_failed",
          "Failed to download document",
          { err },
        );
        await recordWhatsAppInboundError({
          inboundId: inbound.id,
          message,
          context,
          kind: "document_download_failed",
          summary: safeErrorSummary(err),
        });
        await sendWhatsAppMessage(
          from,
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
          ? "NOTA: l'utente ha inviato un messaggio vocale. Usa la TRASCRIZIONE qui sotto."
          : null,
        fallbackText: hasAudio
          ? "Messaggio vocale"
          : hasImage
            ? "Immagine"
            : "Documento",
        defaultMediaPrompt: hasImage
          ? "L'utente ha inviato questa immagine."
          : "L'utente ha inviato questo file.",
        files,
      });

    // Generate Response
    let assistantText = "";
    let assistantMessageId: string | undefined;
    try {
      const flowResult = await runChannelFlow({
        channel: "WHATSAPP",
        userId: user.id,
        conversationThreadId: conversationThread.id,
        userMessageId: inbound.id,
        userMessageText:
          userMessageText || (hasImage ? "Immagine" : "Documento"),
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
          channel: "WHATSAPP",
          metadata: {
            whatsapp: { inReplyTo: inbound.id },
          } as Prisma.InputJsonValue,
          saveAssistantMessage: true,
          waitUntil: safeWaitUntil,
        },
      });
      assistantText = flowResult.assistantText;
      assistantMessageId = flowResult.persistence?.messageId;
      if (flowResult.persistence?.status === "failed") {
        await recordWhatsAppInboundError({
          inboundId: inbound.id,
          message,
          context,
          kind: "assistant_persistence_failed",
          summary: safeErrorSummary(flowResult.persistence.error),
        });
        await sendWhatsAppMessage(from, "Errore temporaneo. Riprova.");
        await failInbound(flowResult.persistence.error);
        return;
      }
    } catch (err) {
      whatsappLogger.error("chat.stream_failed", "streamChat failed", { err });
      await prisma.message
        .update({
          where: { id: inbound.id },
          data: {
            metadata: {
              whatsapp: {
                id: messageId,
                timestamp: message.timestamp,
                type: message.type,
                name: context.contacts?.[0]?.profile?.name,
                error: {
                  kind: "streamChat_failed",
                  summary: safeErrorSummary(err),
                },
              },
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
      await sendWhatsAppMessage(from, "Si è verificato un errore. Riprova.");
      await failInbound(err);
      return;
    }

    if (!assistantText.trim()) {
      await prisma.message
        .update({
          where: { id: inbound.id },
          data: {
            metadata: {
              whatsapp: {
                id: messageId,
                timestamp: message.timestamp,
                type: message.type,
                name: context.contacts?.[0]?.profile?.name,
                error: {
                  kind: "empty_assistant_response",
                },
              },
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);

      await sendWhatsAppMessage(
        from,
        "Non ho generato una risposta. Riprova tra qualche secondo.",
      );
      await failInbound("empty_assistant_response");
      return;
    }

    // Voice output
    let voiceFallbackNotice: string | undefined;
    if (isElevenLabsConfigured()) {
      try {
        const preferences = await prisma.preferences.findUnique({
          where: { userId: user.id },
          select: { voiceEnabled: true },
        });

        const voiceResult = await shouldGenerateVoice({
          userId: user.id,
          userMessage: userMessageText,
          assistantText,
          channel: "WHATSAPP",
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

        whatsappLogger.info(
          "voice.delivery_decision",
          "Resolved WhatsApp voice delivery",
          {
            userId: user.id,
            category: voiceResult.category,
            capacityState: voiceResult.capacityState,
            reasonCode: voiceResult.reasonCode,
            shouldGenerateVoice: voiceResult.shouldGenerateVoice,
          },
        );

        if (voiceResult.shouldGenerateVoice) {
          try {
            const audio = await generateVoice(assistantText);
            const success = await sendWhatsAppVoice(from, audio.audioBuffer);

            if (success) {
              if (assistantMessageId) {
                await prisma.message
                  .update({
                    where: { id: assistantMessageId },
                    data: { type: "AUDIO", mediaType: "audio/mpeg" },
                  })
                  .catch((error) =>
                    whatsappLogger.error(
                      "voice.persistence_update_failed",
                      "Failed marking WhatsApp response as audio",
                      { error, userId: user.id, messageId: assistantMessageId },
                    ),
                  );
              }
              await trackVoiceUsage(
                user.id,
                audio.characterCount,
                "WHATSAPP",
                audio.costUsd,
              ).catch((error) =>
                whatsappLogger.error(
                  "voice.usage_tracking_failed",
                  "Failed tracking WhatsApp voice usage",
                  { error, userId: user.id },
                ),
              );
              await completeInbound();
              return;
            }

            whatsappLogger.warn(
              "voice.send_fallback",
              "Voice send returned false, falling back to text",
            );
            if (voiceResult.explicitVoiceRequest) {
              voiceFallbackNotice = getVoiceUnavailability(
                "PROVIDER_UNAVAILABLE",
              ).userMessage;
            }
          } catch (voiceErr) {
            whatsappLogger.error(
              "voice.generation_failed",
              "Voice generation/send threw",
              { voiceErr },
            );
            if (voiceResult.explicitVoiceRequest) {
              voiceFallbackNotice = getVoiceUnavailability(
                "PROVIDER_UNAVAILABLE",
              ).userMessage;
            }
          }
        } else if (voiceResult.explicitVoiceRequest) {
          voiceFallbackNotice = voiceResult.unavailability?.userMessage;
        }
      } catch (err) {
        whatsappLogger.error(
          "voice.process_failed",
          "Voice funnel/process failed",
          { err },
        );
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

    // Text fallback
    const sent = await sendWhatsAppMessage(
      from,
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

function buildWhatsAppGuestUserData(
  context: WhatsAppChangeValue,
): Prisma.UserCreateWithoutIdentitiesInput {
  const name = context.contacts?.[0]?.profile?.name;
  return {
    isGuest: true,
    ...(name
      ? {
          profile: {
            create: { name },
          },
        }
      : {}),
  };
}
