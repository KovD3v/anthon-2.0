import { waitUntil } from "@vercel/functions";
import type { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { streamChat } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { checkRateLimit, incrementUsage } from "@/lib/rate-limit";

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
  const text = message?.text?.trim();
  const fromId = message?.from?.id;
  const chatId = message?.chat?.id;
  const telegramMessageId = message?.message_id;

  if (!text || !fromId || !chatId || !telegramMessageId) {
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
    await sendTelegramMessage(
      chatId,
      "Limite giornaliero raggiunto. Registrati per sbloccare la prova gratuita e limiti più alti.",
    );
    return;
  }

  // Save inbound message.
  const inbound = await prisma.message
    .create({
      data: {
        userId: user.id,
        channel: "TELEGRAM",
        direction: "INBOUND",
        role: "USER",
        type: "TEXT",
        content: text,
        externalMessageId,
        metadata: {
          telegram: {
            updateId: update.update_id,
            chatId,
            fromId,
            username: message?.from?.username,
            languageCode: message?.from?.language_code,
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

  // Generate assistant response.
  let assistantText = "";

  try {
    const result = await streamChat({
      userId: user.id,
      userMessage: text,
      planId: user.subscription?.planId,
      userRole: user.role,
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
              parts: [{ type: "text", text: finalText }] as Prisma.InputJsonValue,
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
          extractAndSaveMemories(user.id, text, finalText).catch((err) => {
            console.error("[Telegram Webhook] Memory extraction error:", err);
          }),
        );
      },
    });

    for await (const chunk of result.textStream) {
      assistantText += chunk;
    }
  } catch (err) {
    console.error("[Telegram Webhook] streamChat failed:", err);
    await sendTelegramMessage(
      chatId,
      "Errore temporaneo. Riprova tra qualche secondo.",
    );
    return;
  }

  if (assistantText.trim().length === 0) {
    await sendTelegramMessage(
      chatId,
      "Non ho generato una risposta. Riprova tra qualche secondo.",
    );
    return;
  }

  await sendTelegramMessage(chatId, assistantText);
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
