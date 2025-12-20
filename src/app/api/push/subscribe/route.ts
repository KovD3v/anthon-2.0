import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Find the user in our database to ensure they are not a guest
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!dbUser || dbUser.isGuest) {
      return new NextResponse("Forbidden - Non-guest users only", {
        status: 403,
      });
    }

    const subscription = await req.json();

    if (!subscription || !subscription.endpoint) {
      return new NextResponse("Invalid subscription", { status: 400 });
    }

    // Save or update the subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys?.p256dh || "",
        auth: subscription.keys?.auth || "",
        updatedAt: new Date(),
      },
      create: {
        userId: dbUser.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || "",
        auth: subscription.keys?.auth || "",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUSH_SUBSCRIBE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
