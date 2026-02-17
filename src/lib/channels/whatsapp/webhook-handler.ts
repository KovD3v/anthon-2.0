import { createHash, randomBytes } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Prisma } from "@/generated/prisma";
import { runChannelFlow } from "@/lib/channel-flow";
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

// --- Types ---

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
        console.error("[WhatsApp Webhook] Background handler error:", err);
      }),
    );

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Not Found" }, { status: 404 });
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
    text = message.text?.body || "";
  } else if (message.type === "image") {
    text = message.image?.caption || "";
  } else if (message.type === "document") {
    text = message.document?.caption || "";
  }

  const hasAudio = message.type === "audio" || message.type === "voice";
  const hasImage = message.type === "image";
  const hasDocument = message.type === "document";

  if (!text && !hasAudio && !hasImage && !hasDocument) {
    // Possibly a reaction or unsupported type
    return;
  }

  // Idempotency
  const existing = await prisma.message.findFirst({
    where: {
      channel: "WHATSAPP",
      externalMessageId: messageId,
    },
    select: { id: true },
  });

  if (existing) return;

  // Check for connection command
  if (text && isConnectCommand(text)) {
    await handleConnectCommand(from);
    return;
  }

  // User Resolution
  const identity = await prisma.channelIdentity.findUnique({
    where: {
      channel_externalId: {
        channel: "WHATSAPP",
        externalId: from,
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          role: true,
          isGuest: true,
          subscription: true,
        },
      },
    },
  });

  const user = identity?.user
    ? identity.user
    : await createGuestUserForWhatsApp(from, context);

  // Rate Limiting
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

    await sendWhatsAppMessage(from, message);
    return;
  }

  let messageType: "IMAGE" | "DOCUMENT" | "AUDIO" | "TEXT";
  let defaultContent: string;

  if (hasImage) {
    messageType = "IMAGE";
    defaultContent = "Foto";
  } else if (hasDocument) {
    messageType = "DOCUMENT";
    defaultContent = "Documento";
  } else if (hasAudio) {
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
        channel: "WHATSAPP",
        direction: "INBOUND",
        role: "USER",
        type: messageType,
        content: text || defaultContent,
        externalMessageId: messageId,
        metadata: {
          whatsapp: {
            id: messageId,
            timestamp: message.timestamp,
            type: message.type,
            name: context.contacts?.[0]?.profile?.name,
          },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    .catch((err) => {
      // Ignore P2002 (unique constraint)
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      )
        return null;
      throw err;
    });

  if (!inbound) return;

  if (process.env.WHATSAPP_DISABLE_AI === "true") return;

  // Process Media (Audio, Image, Document)
  let transcribedText: string | null = null;
  const messageParts: Array<{
    type: "text" | "file";
    text?: string;
    mimeType?: string;
    data?: string;
  }> = [];

  // --- Audio Transcription ---
  if (hasAudio) {
    const audioId = message.audio?.id || message.voice?.id;
    if (audioId) {
      const audioData = await downloadWhatsAppMedia(audioId);
      if (audioData) {
        try {
          transcribedText = await transcribeAudioWithOpenRouter({
            ...audioData,
            title: "WhatsApp Bot",
          });
        } catch (err) {
          console.error("[WhatsApp] Transcription failed:", err);
          await sendWhatsAppMessage(
            from,
            "Non sono riuscito a trascrivere il messaggio audio. Riprova.",
          );
          return;
        }
      }
    }
  }

  // --- Image Download ---
  let downloadedPhoto = false;
  if (hasImage && message.image?.id) {
    const imageData = await downloadWhatsAppMedia(message.image.id);
    if (imageData) {
      messageParts.push({
        type: "file",
        mimeType: imageData.mimeType,
        data: imageData.base64,
      });
      downloadedPhoto = true;
    }
  }

  // --- Document Download ---
  if (hasDocument && message.document?.id) {
    const docData = await downloadWhatsAppMedia(message.document.id);
    if (docData) {
      messageParts.push({
        type: "file",
        mimeType: docData.mimeType,
        data: docData.base64,
      });
      if (!text && message.document.filename) {
        messageParts.unshift({
          type: "text",
          text: `L'utente ha inviato il file: ${message.document.filename}`,
        });
      }
    }
  }

  // Prepare input for AI
  const voiceInstruction = transcribedText
    ? "NOTA: l'utente ha inviato un messaggio vocale. Usa la TRASCRIZIONE qui sotto."
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

  if (userMessageText) {
    messageParts.push({ type: "text", text: userMessageText });
  }

  // Default prompt if nothing else
  if (messageParts.length > 0 && !messageParts.some((p) => p.type === "text")) {
    messageParts.unshift({
      type: "text",
      text: hasImage
        ? "L'utente ha inviato questa immagine."
        : "L'utente ha inviato questo file.",
    });
  }

  // Generate Response
  let assistantText = "";
  try {
    const flowResult = await runChannelFlow({
      channel: "WHATSAPP",
      userId: user.id,
      userMessageText: userMessageText || (hasImage ? "Immagine" : "Documento"),
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
        channel: "WHATSAPP",
        metadata: {
          whatsapp: { inReplyTo: inbound.id },
        } as Prisma.InputJsonValue,
        saveAssistantMessage: true,
        waitUntil: safeWaitUntil,
      },
    });
    assistantText = flowResult.assistantText;
  } catch (err) {
    console.error("[WhatsApp] streamChat failed:", err);
    await sendWhatsAppMessage(from, "Si è verificato un errore. Riprova.");
    return;
  }

  if (!assistantText.trim()) return;

  // Voice output
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
        try {
          const audio = await generateVoice(assistantText);
          const success = await sendWhatsAppVoice(from, audio.audioBuffer);

          if (success) {
            await trackVoiceUsage(user.id, audio.characterCount, "WHATSAPP");
            return;
          }

          console.warn(
            "[WhatsApp] Voice send returned false, falling back to text",
          );
        } catch (voiceErr) {
          console.error("[WhatsApp] Voice generation/send threw:", voiceErr);
          // Fall through to text fallback
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Voice funnel/process failed:", err);
    }
  }

  // Text fallback
  await sendWhatsAppMessage(from, assistantText);
}

async function handleConnectCommand(from: string) {
  const existingIdentity = await prisma.channelIdentity.findUnique({
    where: {
      channel_externalId: { channel: "WHATSAPP", externalId: from },
    },
    include: { user: true },
  });

  if (existingIdentity?.user && !existingIdentity.user.isGuest) {
    await sendWhatsAppMessage(from, "Il tuo account è già collegato.");
    return;
  }

  const rawToken = randomBytes(24).toString("hex");
  const secret = process.env.WHATSAPP_VERIFY_TOKEN; // reuse verify token for hashing secret
  if (!secret) return;

  // Hash token
  const tokenHash = createHash("sha256")
    .update(`wa-link:${secret}:${rawToken}`)
    .digest("hex");

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Note: chatId in LinkToken is just used to send confirmation.
  // For WA, 'chatId' is the 'from' number.
  await prisma.channelLinkToken.create({
    data: {
      channel: "WHATSAPP",
      tokenHash,
      externalId: from,
      chatId: from,
      expiresAt,
    },
  });

  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  const link = `${baseUrl}/link/whatsapp/${rawToken}`;

  await sendWhatsAppMessage(
    from,
    `Per collegare il tuo account, usa questo link:\n${link}`,
  );
}

async function createGuestUserForWhatsApp(
  from: string,
  context: WhatsAppChangeValue,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { isGuest: true },
      select: {
        id: true,
        role: true,
        isGuest: true,
        subscription: true,
      },
    });

    const name = context.contacts?.[0]?.profile?.name;
    if (name) {
      await tx.profile.create({
        data: { userId: user.id, name },
      });
    }

    await tx.channelIdentity.create({
      data: {
        channel: "WHATSAPP",
        externalId: from,
        userId: user.id,
      },
    });

    return user;
  });
}
