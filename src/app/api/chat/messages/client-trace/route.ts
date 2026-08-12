import { z } from "zod";
import { resolveAuthenticatedClerkId } from "@/lib/auth-identity";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { persistClientTrace } from "@/lib/response-profiler/client-trace-persistence";
import {
  clientTraceSchema,
  MAX_TRACE_BYTES,
} from "@/lib/response-profiler/contracts";

const profilerLogger = createLogger("ai");
const identifierSchema = z.string().trim().min(1).max(128);
const requestSchema = z
  .object({
    chatId: identifierSchema,
    clientMessageId: identifierSchema,
    trace: clientTraceSchema,
  })
  .strict();

function jsonError(error: string, status: number, retryable?: boolean) {
  return Response.json(
    { error, ...(retryable === undefined ? {} : { retryable }) },
    { status },
  );
}

export async function PUT(request: Request) {
  const clerkId = await resolveAuthenticatedClerkId(request);
  if (!clerkId) return jsonError("Unauthorized", 401);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRACE_BYTES) {
    return jsonError("Invalid request body", 400);
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_TRACE_BYTES) {
      return jsonError("Invalid request body", 400);
    }
    body = requestSchema.parse(JSON.parse(bodyText));
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) return jsonError("Not found", 404);

  try {
    const result = await persistClientTrace({
      userId: user.id,
      ...body,
    });
    switch (result.status) {
      case "stored":
      case "unchanged":
        return new Response(null, { status: 204 });
      case "pending":
        return jsonError("Response metrics are not ready", 409, true);
      case "conflict":
        return jsonError("Client trace is immutable", 409, false);
      case "forbidden":
        return jsonError("Forbidden", 403);
      case "not_found":
        return jsonError("Not found", 404);
    }
  } catch (error) {
    profilerLogger.error(
      "profiler.client_trace_ingest_failed",
      "Failed ingesting client response trace",
      {
        chatId: body.chatId.slice(0, 128),
        clientMessageId: body.clientMessageId.slice(0, 128),
        errorName: error instanceof Error ? error.name : "unknown",
      },
    );
    return jsonError("Internal server error", 500);
  }
}
