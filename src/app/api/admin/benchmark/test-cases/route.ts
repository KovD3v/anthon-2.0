import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/benchmark/test-cases
 * List all test cases, or get a single one by ID
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { role: true },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    // If an ID is provided, return a single test case
    if (id) {
      const testCase = await prisma.benchmarkTestCase.findUnique({
        where: { id },
      });
      if (!testCase) {
        return NextResponse.json(
          { error: "Test case not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ testCase });
    }

    // Otherwise, return a list
    const where: Prisma.BenchmarkTestCaseWhereInput = {};
    if (category)
      where.category =
        category.toUpperCase() as Prisma.EnumBenchmarkCategoryFilter;
    if (activeOnly) where.isActive = true;

    const testCases = await prisma.benchmarkTestCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ testCases });
  } catch (error) {
    console.error("[TestCases API] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/benchmark/test-cases
 * Create or update test case
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { role: true },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      externalId,
      category,
      name,
      description,
      setup,
      userMessage,
      expectedBehavior,
      isActive,
      tags,
    } = body;

    const data = {
      externalId,
      category: category.toUpperCase(),
      name,
      description,
      setup,
      userMessage,
      expectedBehavior,
      isActive: isActive !== undefined ? isActive : true,
      tags: tags || [],
    };

    let testCase: Prisma.BenchmarkTestCaseGetPayload<Record<string, never>>;
    if (id) {
      testCase = await prisma.benchmarkTestCase.update({
        where: { id },
        data,
      });
    } else {
      testCase = await prisma.benchmarkTestCase.create({
        data,
      });
    }

    return NextResponse.json({ success: true, testCase });
  } catch (error) {
    console.error("[TestCases API] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/benchmark/test-cases
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.benchmarkTestCase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TestCases API] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
