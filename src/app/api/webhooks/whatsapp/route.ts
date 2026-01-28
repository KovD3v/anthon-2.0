import { createHash, createHmac, randomBytes } from "node:crypto";
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

function _safeErrorSummary(err: unknown) {
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

function verifySignature(request: Request, body: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // If secret not set, skip validation (not recommended for prod)

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const hash = createHmac("sha256", secret).update(body).digest("hex");
  const expectedSignature = `sha256=${hash}`;

  return signature === expectedSignature;
}

// --- Main Handler ---

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
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
      message = "Limite giornaliero raggiunto. Registrati per sbloccare la prova gratuita e limiti più alti.\n\nhttps://anthon.ai/sign-up";
    }

    await sendWhatsAppMessage(from, message);
    return;
  }

  // Save Inbound
  const messageType = hasImage
    ? "IMAGE"
    : hasDocument
      ? "DOCUMENT"
      : hasAudio
        ? "AUDIO"
        : "TEXT";
  const defaultContent = hasImage
    ? "Foto"
    : hasDocument
      ? "Documento"
      : hasAudio
        ? "Messaggio vocale"
        : "";

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
          transcribedText = await transcribeWithOpenRouterResponses(audioData);
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

  const userMessageText = text
    ? transcribedText
      ? `${text}\n\n${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`
      : text
    : transcribedText
      ? `${voiceInstruction}\n\n[Trascrizione audio]\n${transcribedText}`
      : "Messaggio vocale";

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
    const result = await streamChat({
      userId: user.id,
      userMessage: userMessageText || (hasImage ? "Immagine" : "Documento"),
      planId: user.subscription?.planId,
      userRole: user.role,
      hasAudio: false, // Input treated as text after transcription
      hasImages: downloadedPhoto,
      messageParts,
      onFinish: async ({ text: finalText, metrics }) => {
        if (!finalText || finalText.trim().length === 0) return;

        // Save assistant message
        await prisma.message.create({
          data: {
            userId: user.id,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            role: "ASSISTANT",
            type: "TEXT",
            content: finalText,
            parts: [{ type: "text", text: finalText }] as Prisma.InputJsonValue,
            metadata: {
              whatsapp: { inReplyTo: inbound.id },
            } as Prisma.InputJsonValue,
            model: metrics.model,
            inputTokens: metrics.inputTokens,
            outputTokens: metrics.outputTokens,
            costUsd: metrics.costUsd,
            generationTimeMs: metrics.generationTimeMs,
          },
        });

        await incrementUsage(
          user.id,
          metrics.inputTokens,
          metrics.outputTokens,
          metrics.costUsd,
        ).catch(console.error);

        safeWaitUntil(
          extractAndSaveMemories(user.id, userMessageText, finalText).catch(
            console.error,
          ),
        );
      },
    });

    for await (const chunk of result.textStream) {
      assistantText += chunk;
    }
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

      console.log("[WhatsApp] User:", {
        id: user.id,
        role: user.role,
        isGuest: user.isGuest,
        sub: user.subscription,
        planId: user.subscription?.planId,
      });

      console.log(
        "[WhatsApp] Voice Funnel Result:",
        JSON.stringify(voiceResult),
      );

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

// --- Utils ---

function isConnectCommand(text: string) {
  const norm = text.trim().toLowerCase();
  return (
    norm === "/connect" ||
    norm === "collega" ||
    norm === "collega profilo" ||
    norm === "connect"
  );
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

function getPublicAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// --- WhatsApp API Calls ---

async function sendWhatsAppMessage(to: string, text: string) {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;

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
  });

  if (!res.ok) {
    console.error(
      "[WhatsApp] Send message failed:",
      res.status,
      await res.text(),
    );
  }
}

async function sendWhatsAppVoice(
  to: string,
  audioBuffer: Buffer,
): Promise<boolean> {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return false;

  // 1. Upload Media
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;

  return await LatencyLogger.measure("Voice: WhatsApp Send", async () => {
    try {
      // Upload
      const uploadUrl = `https://graph.facebook.com/v21.0/${phoneId}/media`;
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      // Use Uint8Array to fix TS error with BlobPart
      // Use audio/mpeg for ElevenLabs mp3 output
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
        console.error(
          "[WhatsApp] Voice upload failed:",
          await uploadRes.text(),
        );
        return false;
      }

      const { id: mediaId } = (await uploadRes.json()) as { id: string };

      // 2. Send Message
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
        console.error("[WhatsApp] Voice send failed:", await sendRes.text());
        return false;
      }

      return true;
    } catch (err) {
      console.error("[WhatsApp] sendWhatsAppVoice error:", err);
      return false;
    }
  });
}

async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // 1. Get URL
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!urlRes.ok) return null;

    const { url, mime_type } = (await urlRes.json()) as {
      url: string;
      mime_type: string;
    };

    // 2. Download Binary
    const binRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!binRes.ok) return null;

    const buffer = await binRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return { base64, mimeType: mime_type };
  } catch (e) {
    console.error("[WhatsApp] Media download err:", e);
    return null;
  }
}

async function transcribeWithOpenRouterResponses(audio: {
  base64: string;
  mimeType: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "WhatsApp Bot",
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
              type: "image_url",
              image_url: {
                url: `data:${audio.mimeType};base64,${audio.base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter API failed: ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}
