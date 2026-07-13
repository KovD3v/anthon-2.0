import { NextResponse } from "next/server";
import { ORCHESTRATOR_MODEL_ID } from "@/lib/ai/providers/openrouter";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createModelExperiment } from "@/lib/model-experiments/service";
import { createModelExperimentSchema } from "@/lib/model-experiments/validation";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const experiments = await prisma.modelExperiment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      variants: true,
      _count: { select: { participants: true, pairs: true } },
    },
  });
  return NextResponse.json({
    experiments: experiments.map((experiment) => {
      const control = experiment.variants.find(
        (variant) => variant.role === "CONTROL",
      );
      return {
        ...experiment,
        readiness: {
          posthogConfigured: Boolean(process.env.POSTHOG_API_KEY),
          variantsConfigured: experiment.variants.length === 2,
          controlMatchesCurrentRouting:
            control?.modelId === ORCHESTRATOR_MODEL_ID,
          databaseConstraints: true,
        },
      };
    }),
  });
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createModelExperimentSchema.safeParse(await request.json());
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
    const experiment = await createModelExperiment(user.id, parsed.data);
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 409 },
    );
  }
}
