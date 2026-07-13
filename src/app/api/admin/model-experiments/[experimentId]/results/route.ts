import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getModelExperimentSummary } from "@/lib/model-experiments/results";

type Context = { params: Promise<{ experimentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  const { experimentId } = await params;
  const summary = await getModelExperimentSummary(experimentId);
  return summary
    ? NextResponse.json({ summary })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
