import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const voiceLogger = createLogger("voice");

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messageId } = await params;
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      deletedAt: null,
      OR: [{ userId: user.id }, { chat: { visibility: "PUBLIC" } }],
    },
    select: {
      attachments: {
        where: { contentType: { startsWith: "audio/" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { blobUrl: true, contentType: true },
      },
    },
  });

  const attachment = message?.attachments[0];
  if (!attachment) {
    return new Response("Audio not found", { status: 404 });
  }

  try {
    const range = request.headers.get("range");
    const upstream = await fetch(attachment.blobUrl, {
      headers: range ? { Range: range } : undefined,
    });
    if (!upstream.ok || !upstream.body) {
      voiceLogger.error(
        "voice.web_delivery_upstream_failed",
        "Voice media provider returned an error",
        { messageId, status: upstream.status },
      );
      return new Response("Audio temporarily unavailable", { status: 502 });
    }

    const headers = new Headers({
      "Content-Type":
        upstream.headers.get("content-type") ?? attachment.contentType,
      "Cache-Control": "private, max-age=300",
      "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-length", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    voiceLogger.error(
      "voice.web_delivery_failed",
      "Failed proxying voice media",
      { error, messageId },
    );
    return new Response("Audio temporarily unavailable", { status: 502 });
  }
}
