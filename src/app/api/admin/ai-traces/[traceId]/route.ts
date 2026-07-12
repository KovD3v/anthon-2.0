import { decryptAiTurnTrace } from "@/lib/ai/trace";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger, withRequestLogContext } from "@/lib/logger";

const traceLogger = createLogger("ai");

export async function GET(
  request: Request,
  context: RouteContext<"/api/admin/ai-traces/[traceId]">,
) {
  return withRequestLogContext(
    request,
    { route: "/api/admin/ai-traces/[traceId]", channel: "WEB" },
    async () => {
      const { user, errorResponse } = await requireSuperAdmin();
      if (errorResponse) return errorResponse;
      if (!user)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const { traceId } = await context.params;

      try {
        const trace = await prisma.aiTurnTrace.findUnique({
          where: { id: traceId },
          select: {
            id: true,
            conversationThreadId: true,
            userMessageId: true,
            assistantMessageId: true,
            status: true,
            contentCaptureStatus: true,
            metadata: true,
            payloadCiphertext: true,
            payloadIv: true,
            payloadTag: true,
            keyVersion: true,
            expiresAt: true,
            createdAt: true,
          },
        });
        if (!trace)
          return Response.json({ error: "Trace not found" }, { status: 404 });

        await prisma.aiTraceAccessAudit.create({
          data: { traceId, actorUserId: user.id, action: "READ_CONTENT" },
        });
        const payload = decryptAiTurnTrace(trace);
        return Response.json({
          trace: {
            ...trace,
            payloadCiphertext: undefined,
            payloadIv: undefined,
            payloadTag: undefined,
            payload,
          },
        });
      } catch (error) {
        traceLogger.error("trace.read_failed", "Failed reading AI trace", {
          error,
          traceId,
          actorUserId: user.id,
        });
        return Response.json(
          { error: "Failed to read AI trace" },
          { status: 500 },
        );
      }
    },
  );
}
