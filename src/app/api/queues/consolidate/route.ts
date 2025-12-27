import { type NextRequest, NextResponse } from "next/server";
import { consolidateMemories } from "@/lib/maintenance/memory-consolidation";
import { verifyQStashAuth } from "@/lib/qstash";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await verifyQStashAuth(request);

    if (!userId) {
      return new NextResponse("Missing userId", { status: 400 });
    }

    // Run Logic
    await consolidateMemories(userId);

    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    console.error("[Queue] Consolidate Error:", error);
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
