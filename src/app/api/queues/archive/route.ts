import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRetentionParams } from "@/lib/maintenance/retention-policy";
import { archiveOldSessions } from "@/lib/maintenance/session-archiver";
import { verifyQStashAuth } from "@/lib/qstash";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await verifyQStashAuth(request);

    if (!userId) {
      return new NextResponse("Missing userId", { status: 400 });
    }

    // Need to fetch user sub to calculate retention
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    const { retentionDays } = getRetentionParams(user);

    // Run Logic
    await archiveOldSessions(userId, retentionDays);

    return NextResponse.json({ success: true, retentionDays });
  } catch (error) {
    console.error("[Queue] Archive Error:", error);
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
