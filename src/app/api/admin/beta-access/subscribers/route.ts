import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { listBetaSubscribers } from "@/lib/beta-access/subscribers";
import { createLogger } from "@/lib/logger";

const betaLogger = createLogger("auth");
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  updatesOnly: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: Request) {
  const { errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    updatesOnly: url.searchParams.get("updatesOnly") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri di paginazione non validi." },
      { status: 400 },
    );
  }

  try {
    const result = await listBetaSubscribers({
      page: parsed.data.page,
      limit: parsed.data.limit,
      updatesOnly: parsed.data.updatesOnly === "true",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    betaLogger.error(
      "beta.admin.subscribers_read_failed",
      "Beta subscribers read failed",
      { error },
    );
    return NextResponse.json(
      { error: "Impossibile caricare gli iscritti." },
      { status: 500 },
    );
  }
}
