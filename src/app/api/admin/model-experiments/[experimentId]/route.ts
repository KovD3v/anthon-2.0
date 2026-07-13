import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  deleteDraftModelExperiment,
  updateDraftModelExperiment,
} from "@/lib/model-experiments/service";
import { updateModelExperimentSchema } from "@/lib/model-experiments/validation";

type Context = { params: Promise<{ experimentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  const { experimentId } = await params;
  const experiment = await prisma.modelExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: true,
      audits: { orderBy: { createdAt: "desc" }, take: 100 },
      _count: { select: { participants: true, pairs: true } },
    },
  });
  return experiment
    ? NextResponse.json({ experiment })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateModelExperimentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid experiment configuration",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  try {
    const { experimentId } = await params;
    const experiment = await updateDraftModelExperiment(
      experimentId,
      user.id,
      parsed.data,
    );
    return NextResponse.json({ experiment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 409 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { experimentId } = await params;
    await deleteDraftModelExperiment(experimentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 409 },
    );
  }
}
