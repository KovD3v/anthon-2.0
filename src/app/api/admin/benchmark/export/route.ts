import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/benchmark/export
 * Export results as JSONL for fine-tuning
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const minScore = parseFloat(searchParams.get("minScore") || "8");

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
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
    console.error("[Export API] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
