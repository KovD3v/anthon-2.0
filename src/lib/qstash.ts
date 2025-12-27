import { Client, Receiver } from "@upstash/qstash";
import type { NextRequest } from "next/server";

if (!process.env.QSTASH_URL || !process.env.QSTASH_TOKEN) {
  throw new Error("QStash environment variables missing");
}

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN,
  baseUrl: process.env.QSTASH_URL,
});

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
});

/**
 * Verifies that the request is coming from QStash.
 * Throws an error if invalid.
 */
export async function verifyQStashAuth(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("Upstash-Signature") || "";

  const isValid = await receiver.verify({
    signature,
    body,
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
  delay?: number,
) {
  const appUrl = process.env.APP_URL || "http://localhost:3000"; // Fallback for local dev
  const destinationUrl = `${appUrl}/${endpoint}`;

  console.log(`[QStash] Publishing to ${destinationUrl}`);

  return qstash.publishJSON({
    url: destinationUrl,
    body,
    delay, // seamless delay support
  });
}

/**
 * Fetch recent events from QStash for the admin dashboard.
 */
export async function getQStashEvents(cursor?: string) {
  try {
    return await qstash.events({ cursor });
  } catch (error) {
    console.error("Failed to fetch QStash events:", error);
    return { events: [], cursor: undefined };
  }
}
