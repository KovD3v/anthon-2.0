import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface HealthStatus {
  status: "connected" | "error";
  message?: string;
}

interface HealthResponse {
  status: "ok" | "degraded";
  database: HealthStatus;
  timestamp: string;
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected" };
  } catch (error) {
    console.error("[Health] Database check failed:", error);
    return {
      status: "error",
      message: "Database connection failed",
    };
  }
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<HealthResponse>> {
  const database = await checkDatabase();

  return NextResponse.json({
    status: database.status === "connected" ? "ok" : "degraded",
    database,
    timestamp: new Date().toISOString(),
  });
}
