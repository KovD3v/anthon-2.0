import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const benchmarkLogger = createLogger("ai");

/**
 * GET /api/admin/benchmark/export
 * Export results as JSONL for fine-tuning
 */
export async function GET(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const rawMinScore = searchParams.get("minScore");

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const minScore = rawMinScore === null ? 8 : Number(rawMinScore);
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 10) {
      return NextResponse.json(
        { error: "minScore must be a number between 0 and 10" },
        { status: 400 },
      );
    }

    // Fetch results for the run, then apply the same effective-score priority
    // used by the benchmark UI: admin final score > consensus > judge 1.
    const results = await prisma.benchmarkResult.findMany({
      where: {
        runId,
      },
      include: {
        run: true,
      },
    });

    const qualifyingResults = results.filter((result) => {
      const effectiveScore =
        result.finalScore ?? result.consensusScore ?? result.overallScore;
      return effectiveScore >= minScore;
    });

    if (qualifyingResults.length === 0) {
      return NextResponse.json(
        { error: "No results found with the given criteria" },
        { status: 404 },
      );
    }

    const testCaseIds = [
      ...new Set(qualifyingResults.map((result) => result.testCaseId)),
    ];
    const testCases = await prisma.benchmarkTestCase.findMany({
      where: {
        OR: [{ id: { in: testCaseIds } }, { externalId: { in: testCaseIds } }],
      },
      select: {
        id: true,
        externalId: true,
        setup: true,
        userMessage: true,
      },
    });
    const testCasesById = new Map(
      testCases.flatMap((testCase) => {
        const entries: Array<[string, (typeof testCases)[number]]> = [
          [testCase.id, testCase],
        ];
        if (testCase.externalId) {
          entries.push([testCase.externalId, testCase]);
        }
        return entries;
      }),
    );

    // Format as JSONL for fine-tuning / golden-response review.
    const jsonlLines = qualifyingResults
      .map((r) => {
        const messages: { role: string; content: string }[] = [
          {
            role: "system",
            content: "Sei Anthon, un coach digitale di performance sportiva.",
          },
        ];
        const testCase = testCasesById.get(r.testCaseId);
        const setup = testCase?.setup as
          | { session?: Array<{ role?: string; content?: string }> }
          | null
          | undefined;

        for (const message of setup?.session ?? []) {
          if (
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string"
          ) {
            messages.push({ role: message.role, content: message.content });
          }
        }

        messages.push({
          role: "user",
          content: testCase?.userMessage ?? r.testCaseId,
        });
        messages.push({ role: "assistant", content: r.responseText });

        const effectiveScore =
          r.finalScore ?? r.consensusScore ?? r.overallScore;
        return JSON.stringify({
          messages,
          metadata: {
            runId,
            testCaseId: r.testCaseId,
            modelId: r.modelId,
            score: effectiveScore,
          },
        });
      })
      .join("\n");

    return new NextResponse(jsonlLines, {
      headers: {
        "Content-Type": "application/x-jsonlines",
        "Content-Disposition": `attachment; filename="benchmark-export-${runId}.jsonl"`,
      },
    });
  } catch (error) {
    benchmarkLogger.error("get.error", "Failed to export benchmark results", {
      error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
