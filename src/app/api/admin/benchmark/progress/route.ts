import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/benchmark/progress
 * Get progress of a specific benchmark run
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const run = await prisma.benchmarkRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        totalTests: true,
        completedTests: true,
        currentProgress: true,
        startedAt: true,
        endedAt: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      total: run.totalTests,
      completed: run.completedTests,
      currentProgress: run.currentProgress,
      progress:
        run.totalTests > 0 ? (run.completedTests / run.totalTests) * 100 : 0,
    });
  } catch (error) {
    console.error("[Progress API] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
