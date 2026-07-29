import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse<{ status: "ok" }>> {
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
