import { z } from "zod";
import { redactTraceMetadata, redactTracePayload } from "@/lib/ai/tool-privacy";
import { decryptAiTurnTrace } from "@/lib/ai/trace";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger, withRequestLogContext } from "@/lib/logger";

const traceLogger = createLogger("ai");
const noStoreHeaders = { "Cache-Control": "private, no-store" };
const traceAccessRequestSchema = z.object({
  purpose: z.enum(["DEBUGGING", "USER_SUPPORT", "SAFETY_ABUSE_INVESTIGATION"]),
  reason: z.string().trim().min(1).max(2_000),
  caseId: z.string().trim().min(1).max(256),
});

export async function POST(
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

      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return Response.json(
          { error: "Purpose, reason, and case ID are required" },
          { status: 400, headers: noStoreHeaders },
        );
      }

      if (
        typeof input === "object" &&
        input !== null &&
        (input as { purpose?: unknown }).purpose === "APPROVED_QUALITY_REVIEW"
      ) {
        return Response.json(
          { error: "Approved quality review projects are not available" },
          { status: 400, headers: noStoreHeaders },
        );
      }

      const access = traceAccessRequestSchema.safeParse(input);
      if (!access.success) {
        return Response.json(
          { error: "Purpose, reason, and case ID are required" },
          { status: 400, headers: noStoreHeaders },
        );
      }

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
          return Response.json(
            { error: "Trace not found" },
            { status: 404, headers: noStoreHeaders },
          );

        if (trace.expiresAt <= new Date()) {
          return Response.json(
            { error: "Trace expired" },
            { status: 410, headers: noStoreHeaders },
          );
        }

        await prisma.aiTraceAccessAudit.create({
          data: {
            traceId,
            actorUserId: user.id,
            action: "READ_CONTENT",
            purpose: access.data.purpose,
            reason: access.data.reason,
            caseId: access.data.caseId,
          },
        });
        if (trace.expiresAt <= new Date()) {
          return Response.json(
            { error: "Trace expired" },
            { status: 410, headers: noStoreHeaders },
          );
        }
        const payload = decryptAiTurnTrace(trace);
        return Response.json(
          {
            trace: {
              ...trace,
              metadata: redactTraceMetadata(trace.metadata),
              payloadCiphertext: undefined,
              payloadIv: undefined,
              payloadTag: undefined,
              payload: redactTracePayload(payload),
            },
          },
          { headers: noStoreHeaders },
        );
      } catch (error) {
        const errorRecord =
          error && typeof error === "object"
            ? (error as { code?: unknown })
            : null;
        const errorCode =
          typeof errorRecord?.code === "string" ? errorRecord.code : undefined;
        traceLogger.error("trace.read_failed", "Failed reading AI trace", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          ...(errorCode ? { errorCode } : {}),
          traceId,
          actorUserId: user.id,
        });
        return Response.json(
          { error: "Failed to read AI trace" },
          { status: 500, headers: noStoreHeaders },
        );
      }
    },
  );
}
