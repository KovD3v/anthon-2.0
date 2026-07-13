import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  getPrivateVoiceBlob,
  isPrivateVoiceBlobUrl,
} from "@/lib/voice/storage";

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
    const ifNoneMatch = request.headers.get("if-none-match");

    if (isPrivateVoiceBlobUrl(attachment.blobUrl)) {
      const privateBlob = await getPrivateVoiceBlob(attachment.blobUrl, {
        range,
        ifNoneMatch,
      });

      if (!privateBlob) {
        return new Response("Audio not found", { status: 404 });
      }

      const headers = createDeliveryHeaders(
        privateBlob.headers,
        privateBlob.statusCode === 304 ? null : privateBlob.blob.contentType,
        attachment.contentType,
      );
      headers.set("ETag", privateBlob.blob.etag);

      if (privateBlob.statusCode === 304) {
        return new Response(null, { status: 304, headers });
      }

      // The Blob SDK represents successful range responses as statusCode 200,
      // while retaining the provider Content-Range header. Mirror the actual
      // upstream status so browser media controls can seek normally.
      const status = privateBlob.headers.has("content-range") ? 206 : 200;
      return new Response(privateBlob.stream, { status, headers });
    }

    // Legacy voice attachments were written to the old public store. Keep
    // serving them only through their normal retention period; no new voice
    // response may enter this branch because uploads use the private helper.
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

    return new Response(upstream.body, {
      status: upstream.status,
      headers: createDeliveryHeaders(
        upstream.headers,
        upstream.headers.get("content-type"),
        attachment.contentType,
      ),
    });
  } catch (error) {
    voiceLogger.error(
      "voice.web_delivery_failed",
      "Failed proxying voice media",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        messageId,
      },
    );
    return new Response("Audio temporarily unavailable", { status: 502 });
  }
}

function createDeliveryHeaders(
  upstreamHeaders: Pick<Headers, "get">,
  upstreamContentType: string | null,
  fallbackContentType: string,
): Headers {
  const headers = new Headers({
    "Content-Type": upstreamContentType ?? fallbackContentType,
    // Voice can contain sensitive personal/coaching content. Do not leave it
    // on disk or in shared intermediary caches after an authenticated stream.
    "Cache-Control": "private, no-store",
    "Accept-Ranges": upstreamHeaders.get("accept-ranges") ?? "bytes",
    "X-Content-Type-Options": "nosniff",
  });

  for (const name of ["content-length", "content-range"]) {
    const value = upstreamHeaders.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}
