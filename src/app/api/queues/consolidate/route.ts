import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { consolidateMemories } from "@/lib/maintenance/memory-consolidation";
import { verifyQStashAuth } from "@/lib/qstash";

const qstashLogger = createLogger("qstash");

export async function POST(request: Request) {
  try {
    const { userId } = await verifyQStashAuth(request);

    if (!userId) {
      return new NextResponse("Missing userId", { status: 400 });
    }

    // Run Logic
    await consolidateMemories(userId);

    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    qstashLogger.error("consolidate.error", "Queue consolidate job failed", { error });
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
