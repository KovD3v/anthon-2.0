import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { analyzeUserProfile } from "@/lib/maintenance/profile-analyzer";
import { verifyQStashAuth } from "@/lib/qstash";

const qstashLogger = createLogger("qstash");

export async function POST(request: Request) {
  try {
    const { userId } = await verifyQStashAuth(request);

    if (!userId) {
      return new NextResponse("Missing userId", { status: 400 });
    }

    // Run Logic
    await analyzeUserProfile(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    qstashLogger.error("analyze.error", "Queue analyze job failed", { error });
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
