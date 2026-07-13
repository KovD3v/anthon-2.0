import { Client, Receiver } from "@upstash/qstash";
import { createLogger } from "@/lib/logger";

const qstashLogger = createLogger("qstash");

function getQStashClient() {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.QSTASH_URL;

  if (!token || !baseUrl) {
    throw new Error("QStash environment variables missing");
  }

  return new Client({ token, baseUrl });
}

function getQStashReceiver() {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    throw new Error("QStash signing keys missing");
  }

  return new Receiver({ currentSigningKey, nextSigningKey });
}

/**
 * Verifies that the request is coming from QStash.
 * Throws an error if invalid.
 */
export async function verifyQStashAuth(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("Upstash-Signature") || "";

  const isValid = await getQStashReceiver().verify({
    signature,
    body,
    // Bind the signed payload to this exact endpoint. Without the URL, a
    // valid QStash signature could be replayed against another queue route.
    url: req.url,
  });

  if (!isValid) {
    throw new Error("Invalid QStash signature");
  }

  // If body is empty, return empty object, otherwise parse JSON
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return { rawBody: body };
  }
}

/**
 * Publish a JSON message to a QStash queue (or topic).
 * Since we are using an API route as the receiver, we publish directly to the URL.
 */
export async function publishToQueue(
  endpoint: string,
  body: unknown,
  options?: {
    delay?: number;
    deduplicationId?: string;
    retries?: number;
  },
) {
  const appUrl = process.env.APP_URL || "http://localhost:3000"; // Fallback for local dev
  const destinationUrl = `${appUrl}/${endpoint}`;

  qstashLogger.info("publish", "Publishing to queue", { destinationUrl });

  return getQStashClient().publishJSON({
    url: destinationUrl,
    body,
    delay: options?.delay, // seamless delay support
    deduplicationId: options?.deduplicationId,
    retries: options?.retries,
  });
}

/**
 * Fetch recent events from QStash for the admin dashboard.
 */
export async function getQStashEvents(cursor?: string) {
  try {
    return await getQStashClient().events({ cursor });
  } catch (error) {
    qstashLogger.error("events.fetch_failed", "Failed to fetch QStash events", {
      error,
    });
    return { events: [], cursor: undefined };
  }
}
