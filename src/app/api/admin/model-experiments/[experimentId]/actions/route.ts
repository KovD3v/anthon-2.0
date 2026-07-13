import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { transitionModelExperiment } from "@/lib/model-experiments/service";

type Context = { params: Promise<{ experimentId: string }> };
const actionSchema = z.object({
  action: z.enum(["READY", "ACTIVATE", "PAUSE", "RESUME", "COMPLETE"]),
});

export async function POST(request: Request, { params }: Context) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lifecycle action" },
      { status: 400 },
    );
  }
  try {
    const { experimentId } = await params;
    const experiment = await transitionModelExperiment(
      experimentId,
      user.id,
      parsed.data.action,
    );
    return NextResponse.json({ experiment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 409 },
    );
  }
}
