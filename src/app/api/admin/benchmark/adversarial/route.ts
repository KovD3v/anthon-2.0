/**
 * API Routes for Adversarial Test Case Generation
 * POST - Generate adversarial cases
 * GET - List pending (unapproved) adversarial cases
 */

import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  generateAdversarialCases,
  getPendingAdversarialCases,
  saveAdversarialCase,
} from "@/lib/benchmark";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/benchmark/adversarial
 * Generate new adversarial test cases
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const { count = 3, categories, focusOnLowScores = false } = body;

    console.log("[Adversarial API] Generating cases:", {
      count,
      categories,
      focusOnLowScores,
    });

    const generatedCases = await generateAdversarialCases({
      count: Math.min(count, 10), // Cap at 10
      categories,
      focusOnLowScores,
    });

    // Optionally auto-save to database
    const savedIds: string[] = [];
    if (body.autoSave) {
      for (const gc of generatedCases) {
        const id = await saveAdversarialCase(gc);
        savedIds.push(id);
      }
    }

    return NextResponse.json({
      success: true,
      count: generatedCases.length,
      cases: generatedCases,
      savedIds: savedIds.length > 0 ? savedIds : undefined,
    });
  } catch (error) {
    console.error("[Adversarial API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/benchmark/adversarial
 * List pending adversarial cases
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { role: true },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pendingCases = await getPendingAdversarialCases();

    return NextResponse.json({
      success: true,
      count: pendingCases.length,
      cases: pendingCases,
    });
  } catch (error) {
    console.error("[Adversarial API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/benchmark/adversarial
 * Approve or reject adversarial cases
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { role: true },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { testCaseId, action } = await request.json();

    if (!testCaseId || !action) {
      return NextResponse.json(
        { error: "testCaseId and action are required" },
        { status: 400 },
      );
    }

    if (action === "approve") {
      await prisma.benchmarkTestCase.update({
        where: { id: testCaseId },
        data: { isActive: true },
      });
    } else if (action === "reject") {
      await prisma.benchmarkTestCase.delete({
        where: { id: testCaseId },
      });
    } else {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      action,
      testCaseId,
    });
  } catch (error) {
    console.error("[Adversarial API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
