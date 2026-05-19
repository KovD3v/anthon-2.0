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

    // Fetch results with high scores (Golden Responses)
    const results = await prisma.benchmarkResult.findMany({
      where: {
        runId,
        overallScore: { gte: minScore },
      },
      include: {
        run: true,
      },
    });

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No results found with the given criteria" },
        { status: 404 },
      );
    }

    // Format as JSONL for fine-tuning (OpenAI/Gemini format)
    const jsonlLines = results
      .map((r) => {
        // Reconstruct the conversation
        // In a real scenario, we might want to fetch the test case setup again
        // but here we can try to use what we saved in the result if possible.
        // For now, let's assume a simple {messages: [...]} format.

        const messages: { role: string; content: string }[] = [
          {
            role: "system",
            content: "Sei Anthon, un coach digitale di performance sportiva.",
          },
        ];

        // Add user message and assistant response
        // This is a simplified version. For a better one, we'd need the full context.
        messages.push({ role: "user", content: "..." }); // Placeholder for original user message
        messages.push({ role: "assistant", content: r.responseText });

        return JSON.stringify({ messages });
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
