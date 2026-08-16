import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BETA_ACCESS_COOKIE_MAX_AGE_SECONDS,
  BETA_ACCESS_COOKIE_NAME,
} from "./constants";

const COOKIE_FORMAT_VERSION = "v1";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export { BETA_ACCESS_COOKIE_MAX_AGE_SECONDS, BETA_ACCESS_COOKIE_NAME };

type SignCookieInput = {
  configVersion: number;
  secret: string;
  now?: Date;
  nonce?: string;
};

type VerifyCookieInput = {
  secret: string;
  now?: Date;
};

function signatureFor(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signBetaAccessCookie({
  configVersion,
  secret,
  now = new Date(),
  nonce = randomBytes(18).toString("base64url"),
}: SignCookieInput): string {
  if (!Number.isSafeInteger(configVersion) || configVersion < 1) {
    throw new Error("Beta access config version must be a positive integer");
  }
  if (secret.length < 32) {
    throw new Error(
      "Beta access cookie secret must contain at least 32 characters",
    );
  }
  if (!BASE64URL_PATTERN.test(nonce) || nonce.length < 8) {
    throw new Error("Beta access cookie nonce is invalid");
  }

  const expiresAtSeconds =
    Math.floor(now.getTime() / 1000) + BETA_ACCESS_COOKIE_MAX_AGE_SECONDS;
  const payload = [
    COOKIE_FORMAT_VERSION,
    configVersion,
    expiresAtSeconds,
    nonce,
  ].join(".");
  const signature = signatureFor(payload, secret).toString("base64url");
  return `${payload}.${signature}`;
}

export function verifyBetaAccessCookie(
  value: string,
  { secret, now = new Date() }: VerifyCookieInput,
): { configVersion: number; expiresAt: Date } | null {
  if (secret.length < 32) return null;

  const fields = value.split(".");
  if (fields.length !== 5) return null;
  const [format, versionText, expiresText, nonce, signatureText] = fields;
  if (
    format !== COOKIE_FORMAT_VERSION ||
    !versionText ||
    !expiresText ||
    !nonce ||
    nonce.length < 8 ||
    !BASE64URL_PATTERN.test(nonce) ||
    !signatureText ||
    !BASE64URL_PATTERN.test(signatureText)
  ) {
    return null;
  }

  const configVersion = Number(versionText);
  const expiresAtSeconds = Number(expiresText);
  if (
    !Number.isSafeInteger(configVersion) ||
    configVersion < 1 ||
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= Math.floor(now.getTime() / 1000)
  ) {
    return null;
  }

  const suppliedSignature = Buffer.from(signatureText, "base64url");
  const payload = fields.slice(0, 4).join(".");
  const expectedSignature = signatureFor(payload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  return {
    configVersion,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

export function betaAccessCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: BETA_ACCESS_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    priority: "high" as const,
  };
}
