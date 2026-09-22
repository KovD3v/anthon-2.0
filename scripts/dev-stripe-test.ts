import { spawn, spawnSync } from "node:child_process";
import {
  getStripeTestDatabaseUrl,
  getStripeTestOrigin,
} from "../src/lib/billing/config";

getStripeTestDatabaseUrl();
const origin = getStripeTestOrigin();
if (new URL(origin).hostname !== "localhost")
  throw new Error("This runner is local-only");
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_test_"))
  throw new Error("A Stripe test key is required");
const stripeEnv = { ...process.env, STRIPE_API_KEY: key };
const result = spawnSync("bunx", ["@stripe/cli", "listen", "--print-secret"], {
  env: stripeEnv,
  encoding: "utf8",
  timeout: 30_000,
});
const secret = result.stdout?.match(/whsec_[A-Za-z0-9]+/)?.[0];
if (result.status !== 0 || !secret)
  throw new Error("Cannot configure the local Stripe webhook listener");

const listener = spawn(
  "bunx",
  [
    "@stripe/cli",
    "listen",
    "--forward-to",
    `${origin}/api/webhooks/stripe`,
    "--events",
    "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,invoice.paid,invoice.payment_failed",
  ],
  { env: stripeEnv, stdio: ["ignore", "pipe", "pipe"] },
);
// Keep the CLI-generated signing secret in process memory, never in terminal output.
function redact(chunk: Buffer) {
  process.stdout.write(
    chunk.toString().replace(/whsec_[A-Za-z0-9]+/g, "[redacted]"),
  );
}
listener.stdout?.on("data", redact);
listener.stderr?.on("data", redact);
const server = spawn(
  "bun",
  ["run", "dev", "--port", new URL(origin).port || "3000"],
  { env: { ...process.env, STRIPE_WEBHOOK_SECRET: secret }, stdio: "inherit" },
);

function stop() {
  listener.kill("SIGTERM");
  server.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
listener.on("exit", () => server.kill("SIGTERM"));
server.on("exit", (code) => {
  listener.kill("SIGTERM");
  process.exitCode = code ?? 1;
});
