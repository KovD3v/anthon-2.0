import { getAuthUser } from "@/lib/auth";
import { resolveModelComparisonPair } from "@/lib/model-experiments/service";
import { voteSchema } from "@/lib/model-experiments/validation";

type Context = { params: Promise<{ pairId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { user, error } = await getAuthUser();
  if (!user) {
    return Response.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }
  const parsed = voteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid choice" }, { status: 400 });
  }
  try {
    const { pairId } = await params;
    const result = await resolveModelComparisonPair({
      pairId,
      userId: user.id,
      clerkId: user.clerkId,
      choice: parsed.data.choice,
    });
    return Response.json({
      message: {
        id: result.message.id,
        role: "assistant",
        parts: result.message.parts,
        createdAt: result.message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "VOTE_FAILED";
    const status =
      code === "PAIR_NOT_FOUND"
        ? 404
        : code === "PAIR_ALREADY_RESOLVED"
          ? 409
          : 422;
    return Response.json({ error: code }, { status });
  }
}
