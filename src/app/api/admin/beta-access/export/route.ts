import { requireSuperAdmin } from "@/lib/auth";
import { buildBetaSubscribersCsv } from "@/lib/beta-access/csv";
import { getBetaSubscribersForExport } from "@/lib/beta-access/subscribers";
import { createLogger } from "@/lib/logger";

const betaLogger = createLogger("auth");

export async function GET() {
  const { user, errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const subscribers = await getBetaSubscribersForExport();
    const csv = buildBetaSubscribersCsv(subscribers);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="anthon-beta-subscribers-${date}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    betaLogger.error(
      "beta.admin.export_failed",
      "Beta subscriber export failed",
      { error, actorUserId: user.id },
    );
    return Response.json(
      { error: "Impossibile esportare gli iscritti." },
      { status: 500 },
    );
  }
}
