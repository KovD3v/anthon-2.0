import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSystemHealth } from "@/lib/system-health";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const wantsDetails = new URL(request.url).searchParams.get("details") === "1";

  if (!wantsDetails) {
    return NextResponse.json(
      { status: "ok" as const },
      { headers: NO_STORE_HEADERS },
    );
  }

  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const health = await getSystemHealth();
  return NextResponse.json(health, { headers: NO_STORE_HEADERS });
}
