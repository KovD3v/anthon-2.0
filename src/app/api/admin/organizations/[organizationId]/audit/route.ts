import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { listOrganizationAuditLogs } from "@/lib/organizations/service";

const organizationsLogger = createLogger("organizations");

// GET /api/admin/organizations/[organizationId]/audit - immutable audit trail
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  return withRequestLogContext(
    req,
    {
      route: "/api/admin/organizations/[organizationId]/audit",
      channel: "WEB",
    },
    async () => {
      const { errorResponse } = await requireAdmin();
      if (errorResponse) return errorResponse;

      try {
        const { organizationId } = await context.params;
        const page = Math.max(
          1,
          Number(req.nextUrl.searchParams.get("page")) || 1,
        );
        const limit = Math.min(
          100,
          Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50),
        );
        const skip = (page - 1) * limit;

        const logs = await listOrganizationAuditLogs(organizationId, {
          take: limit + 1,
          skip,
        });
        const hasMore = logs.length > limit;

        return NextResponse.json({
          logs: hasMore ? logs.slice(0, limit) : logs,
          pagination: {
            page,
            limit,
            hasMore,
          },
        });
      } catch (error) {
        organizationsLogger.error(
          "organizations.api.audit.get_failed",
          "Organization Audit API GET failed",
          { error },
        );
        return NextResponse.json(
          { error: "Failed to fetch audit logs" },
          { status: 500 },
        );
      }
    },
  );
}
