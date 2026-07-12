import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger, withRequestLogContext } from "@/lib/logger";

const traceLogger = createLogger("ai");

export async function GET(request: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/admin/ai-traces", channel: "WEB" },
    async () => {
      const { errorResponse } = await requireSuperAdmin();
      if (errorResponse) return errorResponse;

      const { searchParams } = new URL(request.url);
      const conversationThreadId = searchParams.get("conversationThreadId");
      const messageId = searchParams.get("messageId");
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      const limit = Math.min(
        Math.max(Number(searchParams.get("limit") ?? 50), 1),
        100,
      );
      const createdAt = {
        ...(from && !Number.isNaN(Date.parse(from))
          ? { gte: new Date(from) }
          : {}),
        ...(to && !Number.isNaN(Date.parse(to)) ? { lte: new Date(to) } : {}),
      };

      try {
        const traces = await prisma.aiTurnTrace.findMany({
          where: {
            ...(conversationThreadId ? { conversationThreadId } : {}),
            ...(messageId
              ? {
                  OR: [
                    { userMessageId: messageId },
                    { assistantMessageId: messageId },
                  ],
                }
              : {}),
            ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            conversationThreadId: true,
            userMessageId: true,
            assistantMessageId: true,
            status: true,
            contentCaptureStatus: true,
            metadata: true,
            expiresAt: true,
            createdAt: true,
          },
        });
        return Response.json({ traces });
      } catch (error) {
        traceLogger.error("trace.list_failed", "Failed listing AI traces", {
          error,
        });
        return Response.json(
          { error: "Failed to list AI traces" },
          { status: 500 },
        );
      }
    },
  );
}
