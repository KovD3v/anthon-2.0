/**
 * Benchmark Admin API Routes
 *
 * GET - List benchmark runs or get specific run
 * POST - Start new benchmark run
 * PATCH - Update admin review
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

// Dynamically import benchmark functions to avoid issues before migration
async function getBenchmarkModule() {
	return import("@/lib/benchmark");
}

/**
 * GET /api/admin/benchmark
 * Query params:
 *   - runId: Get specific run with results
 *   - limit: Number of runs to list (default 20)
 */
export async function GET(request: NextRequest) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		// Check admin role
		const user = await prisma.user.findFirst({
			where: { clerkId: userId },
			select: { role: true },
		});

		if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const runId = searchParams.get("runId");
		const limit = parseInt(searchParams.get("limit") || "20", 10);

		const { getBenchmarkRun, listBenchmarkRuns, getModelScores } =
			await getBenchmarkModule();

		if (runId) {
			// Get specific run with results
			const run = await getBenchmarkRun(runId);
			if (!run) {
				return NextResponse.json(
					{ error: "Benchmark run not found" },
					{ status: 404 }
				);
			}

			const modelScores = await getModelScores(runId);

			return NextResponse.json({ run, modelScores });
		}

		// List all runs
		const runs = await listBenchmarkRuns(limit);
		return NextResponse.json({ runs });
	} catch (error) {
		console.error("[Benchmark API] GET error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/admin/benchmark
 * Body:
 *   - name?: string
 *   - description?: string
 *   - models?: string[]
 *   - testCaseIds?: string[]
 *   - categories?: ('tool_usage' | 'writing_quality')[]
 */
export async function POST(request: NextRequest) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		// Check admin role
		const user = await prisma.user.findFirst({
			where: { clerkId: userId },
			select: { role: true },
		});

		if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const body = await request.json();
		const { runBenchmark } = await getBenchmarkModule();

		// Start benchmark (runs in background)
		const runId = await runBenchmark({
			runName: body.name,
			description: body.description,
			models: body.models,
			testCaseIds: body.testCaseIds,
			categories: body.categories,
		});

		return NextResponse.json({
			success: true,
			runId,
			message: "Benchmark started",
		});
	} catch (error) {
		console.error("[Benchmark API] POST error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

/**
 * PATCH /api/admin/benchmark
 * Body for run approval:
 *   - runId: string
 *   - approved?: boolean
 *   - notes?: string
 * Body for result admin scoring:
 *   - resultId: string
 *   - adminScore: number (0-10)
 *   - adminReasoning?: string
 */
export async function PATCH(request: NextRequest) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		// Check admin role
		const user = await prisma.user.findFirst({
			where: { clerkId: userId },
			select: { id: true, role: true },
		});

		if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const body = await request.json();

		// Handle result admin scoring
		if (body.resultId) {
			const { resultId, adminScore, adminReasoning } = body;

			if (
				typeof adminScore !== "number" ||
				adminScore < 0 ||
				adminScore > 10
			) {
				return NextResponse.json(
					{ error: "adminScore must be a number between 0 and 10" },
					{ status: 400 }
				);
			}

			// Get current result to calculate weighted score
			const currentResult = await prisma.benchmarkResult.findUnique({
				where: { id: resultId },
				select: { overallScore: true },
			});

			if (!currentResult) {
				return NextResponse.json(
					{ error: "Result not found" },
					{ status: 404 }
				);
			}

			// Calculate weighted final score: 0.6 * admin + 0.4 * judge
			const ADMIN_WEIGHT = 0.6;
			const JUDGE_WEIGHT = 0.4;
			const finalScore =
				ADMIN_WEIGHT * adminScore +
				JUDGE_WEIGHT * currentResult.overallScore;

			const updated = await prisma.benchmarkResult.update({
				where: { id: resultId },
				data: {
					adminScore,
					adminReasoning,
					adminReviewedBy: user.id,
					adminReviewedAt: new Date(),
					finalScore,
				},
			});

			return NextResponse.json({ success: true, result: updated });
		}

		// Handle run approval
		const { runId, approved, notes } = body;

		if (!runId) {
			return NextResponse.json(
				{ error: "runId or resultId is required" },
				{ status: 400 }
			);
		}

		const updated = await prisma.benchmarkRun.update({
			where: { id: runId },
			data: {
				approved,
				reviewNotes: notes,
				reviewedBy: user.id,
				reviewedAt: new Date(),
			},
		});

		return NextResponse.json({ success: true, run: updated });
	} catch (error) {
		console.error("[Benchmark API] PATCH error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/admin/benchmark
 * Query params:
 *   - runId: string - Delete entire benchmark run
 */
export async function DELETE(request: NextRequest) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		// Check admin role
		const user = await prisma.user.findFirst({
			where: { clerkId: userId },
			select: { role: true },
		});

		if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const runId = searchParams.get("runId");

		if (!runId) {
			return NextResponse.json(
				{ error: "runId is required" },
				{ status: 400 }
			);
		}

		// Delete run (cascade will delete results)
		await prisma.benchmarkRun.delete({
			where: { id: runId },
		});

		return NextResponse.json({
			success: true,
			message: "Benchmark run deleted",
		});
	} catch (error) {
		console.error("[Benchmark API] DELETE error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
