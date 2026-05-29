import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { BenchmarkCategory, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const benchmarkLogger = createLogger("ai");

const BENCHMARK_CATEGORIES = ["TOOL_USAGE", "WRITING_QUALITY"] as const;

const BenchmarkSetupSchema = z.object({
  session: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  memories: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        category: z.string().optional(),
      }),
    )
    .default([]),
  userContext: z
    .object({
      profile: z
        .object({
          name: z.string().optional(),
          sport: z.string().optional(),
          goal: z.string().optional(),
          experience: z.string().optional(),
        })
        .nullable()
        .optional(),
      preferences: z
        .object({
          tone: z.string().optional(),
          mode: z.string().optional(),
          language: z.string().optional(),
        })
        .nullable()
        .optional(),
    })
    .default({}),
});

const ToolUsageExpectedSchema = z.object({
  shouldUseTool: z.boolean(),
  expectedTools: z.array(z.string()).optional(),
  forbiddenTools: z.array(z.string()).optional(),
  expectedFields: z.record(z.string(), z.unknown()).optional(),
});

const WritingQualityExpectedSchema = z.object({
  shouldBeShort: z.boolean().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  shouldMentionName: z.boolean().optional(),
  expectedTone: z.string().optional(),
  mustContain: z.array(z.string()).optional(),
  mustNotContain: z.array(z.string()).optional(),
});

const BenchmarkExpectedBehaviorSchema = z.union([
  ToolUsageExpectedSchema,
  WritingQualityExpectedSchema,
]);

const BenchmarkTestCasePayloadSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().optional().nullable(),
  category: z.string(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  setup: BenchmarkSetupSchema,
  userMessage: z.string().min(1),
  expectedBehavior: BenchmarkExpectedBehaviorSchema,
  isActive: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

function normalizeBenchmarkCategory(value: unknown): BenchmarkCategory | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase();
  return BENCHMARK_CATEGORIES.includes(
    normalized as (typeof BENCHMARK_CATEGORIES)[number],
  )
    ? (normalized as BenchmarkCategory)
    : null;
}

/**
 * GET /api/admin/benchmark/test-cases
 * List all test cases, or get a single one by ID
 */
export async function GET(request: Request) {
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
    if (category) {
      const normalizedCategory = normalizeBenchmarkCategory(category);
      if (!normalizedCategory) {
        return NextResponse.json(
          { error: "Invalid category" },
          { status: 400 },
        );
      }
      where.category = normalizedCategory;
    }
    if (activeOnly) where.isActive = true;

    const testCases = await prisma.benchmarkTestCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ testCases });
  } catch (error) {
    benchmarkLogger.error("get.error", "Failed to fetch benchmark test cases", {
      error,
    });
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
export async function POST(request: Request) {
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
    const payloadResult = BenchmarkTestCasePayloadSchema.safeParse(body);
    if (!payloadResult.success) {
      return NextResponse.json(
        { error: "Invalid benchmark test case payload" },
        { status: 400 },
      );
    }

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
    } = payloadResult.data;

    const normalizedCategory = normalizeBenchmarkCategory(category);
    if (!normalizedCategory) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const data = {
      externalId,
      category: normalizedCategory,
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
    benchmarkLogger.error(
      "post.error",
      "Failed to create/update benchmark test case",
      { error },
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/benchmark/test-cases
 */
export async function DELETE(request: Request) {
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

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.benchmarkTestCase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    benchmarkLogger.error(
      "delete.error",
      "Failed to delete benchmark test case",
      { error },
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
