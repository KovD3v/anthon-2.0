import { NextResponse } from "next/server";
import { runBenchmarkForExistingRun } from "@/lib/benchmark";
import type { BenchmarkRunnerOptions } from "@/lib/benchmark/types";
import { createLogger } from "@/lib/logger";
import { verifyQStashAuth } from "@/lib/qstash";

const qstashLogger = createLogger("qstash");

export async function POST(request: Request) {
  try {
    const { runId, options } = await verifyQStashAuth(request);

    if (!runId || typeof runId !== "string") {
      return new NextResponse("Missing runId", { status: 400 });
    }

    const benchmarkOptions =
      typeof options === "object" && options !== null
        ? (options as Omit<BenchmarkRunnerOptions, "runName" | "description">)
        : {};

    await runBenchmarkForExistingRun(runId, benchmarkOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    qstashLogger.error("benchmark.error", "Queue benchmark job failed", {
      error,
    });
    return new NextResponse("Unauthorized or Error", { status: 400 });
  }
}
