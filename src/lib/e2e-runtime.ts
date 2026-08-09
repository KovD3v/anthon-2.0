import { createHmac, timingSafeEqual } from "node:crypto";

export const E2E_SESSION_COOKIE_NAME = "__anthon_e2e_session";

const MIN_SECRET_LENGTH = 32;

export function isE2ERuntimeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.E2E_EPHEMERAL_BRANCH_ID?.startsWith("br-") === true &&
    (env.E2E_AUTH_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH
  );
}

function getSecret(env: NodeJS.ProcessEnv) {
  return isE2ERuntimeEnabled(env) ? env.E2E_AUTH_SECRET : null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createE2ESessionValue(
  clerkId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const normalizedClerkId = clerkId.trim();
  const secret = getSecret(env);
  if (!secret || !normalizedClerkId) {
    throw new Error("E2E runtime is not enabled");
  }

  const payload = Buffer.from(normalizedClerkId, "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyE2ESessionValue(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const secret = getSecret(env);
  if (!secret || !value) return null;

  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length > 0) return null;

  const expectedSignature = sign(payload, secret);
  const actualBytes = Buffer.from(signature, "base64url");
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const clerkId = Buffer.from(payload, "base64url").toString("utf8").trim();
    return clerkId || null;
  } catch {
    return null;
  }
}
