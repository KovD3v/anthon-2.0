import { prisma } from "./src/lib/db";

async function debugNotifications() {
  const now = new Date();
  console.log("Current Time (UTC):", now.toISOString());

  const pending = await prisma.scheduledNotification.findMany({
    where: { processed: false },
    orderBy: { scheduledFor: "asc" },
    include: {
      user: {
        include: {
          pushSubscriptions: true,
        },
      },
    },
  });

  console.log(`\n--- PENDING NOTIFICATIONS: ${pending.length} ---`);
  pending.forEach((n) => {
    console.log(`\nID: ${n.id}`);
    console.log(`User ID: ${n.userId}`);
    console.log(`Type: ${n.type}`);
    console.log(`Scheduled For: ${n.scheduledFor.toISOString()}`);
    console.log(`Past Due: ${n.scheduledFor <= now}`);
    console.log(`User Email: ${n.user.email}`);
    console.log(`Push Subs: ${n.user.pushSubscriptions.length}`);
  });

  process.exit(0);
}

debugNotifications().catch((err) => {
  console.error(err);
  process.exit(1);
});
