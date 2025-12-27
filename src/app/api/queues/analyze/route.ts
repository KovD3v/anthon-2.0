import { type NextRequest, NextResponse } from "next/server";
import { analyzeUserProfile } from "@/lib/maintenance/profile-analyzer";
import { verifyQStashAuth } from "@/lib/qstash";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await verifyQStashAuth(request);

    if (!userId) {
      return new NextResponse("Missing userId", { status: 400 });
    }

    // Run Logic
    await analyzeUserProfile(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Queue] Analyze Error:", error);
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
