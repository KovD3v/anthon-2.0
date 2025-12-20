import dotenv from "dotenv";
import webpush from "web-push";
import { prisma } from "./src/lib/db";

dotenv.config();

// Configure web-push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@anthon.ai",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

async function processNow() {
  console.log("🚦 Manually triggering notification processing...");

  // We'll ignore the 'scheduledFor' check for this test to force it
  const pending = await prisma.scheduledNotification.findMany({
    where: { processed: false },
    include: {
      user: {
        include: {
          pushSubscriptions: true,
        },
      },
    },
  });

  console.log(`Found ${pending.length} pending notifications.`);

  const payload = JSON.stringify({
    title: "Coach Anthon",
    body: "Test notification from manual trigger!",
    url: "/chat",
  });

  for (const n of pending) {
    console.log(`\nProcessing ${n.id} for user ${n.userId}...`);

    if (n.user.pushSubscriptions.length === 0) {
      console.log("❌ No push subscriptions found for user.");
      continue;
    }

    for (const sub of n.user.pushSubscriptions) {
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
        console.log("✅ Successfully sent push!");

        await prisma.scheduledNotification.update({
          where: { id: n.id },
          data: { processed: true, sentAt: new Date() },
        });
      } catch (err: any) {
        console.error("❌ Failed to send push:", err.statusCode || err.message);
      }
    }
  }

  process.exit(0);
}

processNow().catch((err) => {
  console.error(err);
  process.exit(1);
});
