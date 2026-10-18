/**
 * Local Clerk and Vercel Blob emulators (vercel-labs/emulate) for offline tests.
 *
 * The SDKs are redirected only through their own environment variables
 * (CLERK_API_URL, VERCEL_BLOB_API_URL), so production code paths stay unchanged.
 * Stripe is intentionally absent: Emulate has no subscriptions, invoices,
 * Elements checkout sessions, or event ids, which anthon's billing requires.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createEmulator } from "emulate";

const CLERK_SECRET_KEY = "sk_test_emulate";
// Emulate derives the Blob store id from the token's fourth segment.
const BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_emulate_localsecret";

export type EmulatedServices = {
  env: Record<string, string>;
  close: () => Promise<void>;
};

/**
 * Emulate 0.12 answers with `application/json; charset=UTF-8`, but
 * @clerk/backend only parses bodies whose content type equals
 * `application/json`. Real Clerk sends the bare type, so this proxy restores it.
 */
async function startClerkContentTypeProxy(
  target: string,
  port: number,
): Promise<Server> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string" && key !== "host") headers.set(key, value);
    }
    const upstream = await fetch(new URL(req.url ?? "/", target), {
      method: req.method,
      headers,
      body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      redirect: "manual",
    });
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (key === "content-length" || key === "content-encoding") return;
      responseHeaders[key] = value.startsWith("application/json")
        ? "application/json"
        : value;
    });
    res.writeHead(upstream.status, responseHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

function publishableKeyFor(host: string): string {
  return `pk_test_${Buffer.from(`${host}$`).toString("base64")}`;
}

export async function startEmulatedServices(
  ports: { clerk?: number; vercel?: number } = {},
): Promise<EmulatedServices> {
  const clerk = await createEmulator({ service: "clerk", port: 0 });
  const vercel = await createEmulator({
    service: "vercel",
    port: ports.vercel ?? 0,
  });
  const proxy = await startClerkContentTypeProxy(clerk.url, ports.clerk ?? 0);
  const clerkUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

  return {
    env: {
      CLERK_API_URL: clerkUrl,
      CLERK_SECRET_KEY,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKeyFor(
        new URL(clerkUrl).host,
      ),
      VERCEL_BLOB_API_URL: `${vercel.url}/api/blob`,
      BLOB_READ_WRITE_TOKEN,
    },
    close: async () => {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      await Promise.all([clerk.close(), vercel.close()]);
    },
  };
}
