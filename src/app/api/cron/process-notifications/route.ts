import { NextResponse } from "next/server";
import webpush from "web-push";
import { generateReEngagementMessage } from "@/lib/ai/re-engagement";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn(
    "[Cron Notifications] VAPID keys not configured. Web push will not work.",
  );
} else {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@anthon.ai",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

export async function GET(req: Request) {
  try {
    // Basic auth for cron (e.g. CRON_SECRET)
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      // return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();

    // 1. Fetch pending notifications
    const pendingNotifications = await prisma.scheduledNotification.findMany({
      where: {
        processed: false,
        scheduledFor: { lte: now },
      },
      include: {
        user: {
          include: {
            pushSubscriptions: true,
            identities: true,
          },
        },
      },
      take: 50, // Process in batches
    });

    const results = [];

    for (const notification of pendingNotifications) {
      try {
        // 2. Verify relevance
        // Check if user has messaged since this notification was scheduled
        const lastUserMessage = await prisma.message.findFirst({
          where: {
            userId: notification.userId,
            direction: "INBOUND",
            createdAt: { gt: notification.createdAt },
          },
        });

        if (lastUserMessage && notification.type === "PROMISED_FOLLOWUP") {
          // User already engaged, skip this followup
          await prisma.scheduledNotification.update({
            where: { id: notification.id },
            data: {
              processed: true,
              intent: "SKIPPED_USER_ENGAGED",
            },
          });
          continue;
        }

        // 3. Send via channel
        let delivered = false;

        if (notification.channel === "WEB") {
          delivered = await sendWebPush(notification);
        } else if (notification.channel === "WHATSAPP") {
          delivered = await sendWhatsAppPush(notification);
        } else if (notification.channel === "TELEGRAM") {
          delivered = await sendTelegramPush(notification);
        }

        // 4. Mark as processed
        await prisma.scheduledNotification.update({
          where: { id: notification.id },
          data: {
            processed: true,
            sentAt: delivered ? new Date() : null,
          },
        });

        results.push({
          id: notification.id,
          status: delivered ? "sent" : "failed",
        });
      } catch (err) {
        console.error(
          `Failed to process notification ${notification.id}:`,
          err,
        );
      }
    }

    // 5. Run Re-engagement Lottery
    const reEngagementResults = await runReEngagementLottery();

    return NextResponse.json({
      processed: results.length,
      details: results,
      reEngagements: reEngagementResults,
    });
  } catch (error) {
    console.error("[CRON_NOTIFICATIONS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

type NotificationWithUser = {
  id: string;
  type: string;
  intent: string | null;
  userId: string;
  user: {
    pushSubscriptions: Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  };
};

async function runReEngagementLottery() {
  const now = new Date();
  const silentThreshold = new Date(now.getTime() - 8 * 60 * 60 * 1000); // 8h of silence

  const inactiveUsers = await prisma.user.findMany({
    where: {
      isGuest: false,
      lastActivityAt: { lte: silentThreshold },
      scheduledNotifications: {
        none: {
          type: "RE_ENGAGEMENT",
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      },
    },
    include: {
      pushSubscriptions: true,
    },
    take: 20,
  });

  const processed = [];

  for (const user of inactiveUsers) {
    if (Math.random() > 0.15) continue;

    const message = await generateReEngagementMessage(user.id);
    if (!message) continue;

    const notification = await prisma.scheduledNotification.create({
      data: {
        userId: user.id,
        type: "RE_ENGAGEMENT",
        intent: message,
        scheduledFor: new Date(),
        channel: "WEB",
      },
    });

    const delivered = await sendWebPush({
      ...notification,
      user,
    });

    await prisma.scheduledNotification.update({
      where: { id: notification.id },
      data: {
        processed: true,
        sentAt: delivered ? new Date() : null,
      },
    });

    processed.push({
      userId: user.id,
      status: delivered ? "sent" : "failed",
    });
  }

  return processed;
}

async function sendWebPush(notification: NotificationWithUser) {
  const subscriptions = notification.user.pushSubscriptions;
  if (!subscriptions.length) return false;

  const payload = JSON.stringify({
    title: notification.type === "PROMISED_FOLLOWUP" ? "Hey!" : "Coach Anthon",
    body: notification.intent || "How are you doing today?",
    url: "/chat", // Default to chat
  });

  let success = false;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
      );
      success = true;
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or gone, delete it
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      } else {
        console.error("[sendWebPush] Error sending notification:", err);
      }
    }
  }
  return success;
}

async function sendWhatsAppPush(_notification: NotificationWithUser) {
  // TODO: Implement WhatsApp delivery logic (e.g. via Twilio or WhatsApp Cloud API)
  // Check 24h window before sending free-form
  console.log("WhatsApp Push Not Implemented Yet");
  return false;
}

async function sendTelegramPush(_notification: NotificationWithUser) {
  // TODO: Implement Telegram delivery logic
  console.log("Telegram Push Not Implemented Yet");
  return false;
}
