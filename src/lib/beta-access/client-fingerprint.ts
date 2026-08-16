import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { BetaAbuseAction } from "@/generated/prisma";

function parseForwardedAddress(
  value: string | null,
  options: { allowList?: boolean } = {},
): string | null {
  if (!value) return null;
  if (!options.allowList && value.includes(",")) return null;
  const first = (options.allowList ? value.split(",", 1)[0] : value)?.trim();
  if (!first) return null;

  let candidate = first;
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (candidate.includes(":") && isIP(candidate) === 0) {
    const ipv4WithPort = candidate.match(/^([^:]+):\d+$/);
    if (ipv4WithPort?.[1]) candidate = ipv4WithPort[1];
  }
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) candidate = mapped;
  }
  return isIP(candidate) > 0 ? candidate.toLowerCase() : null;
}

function trustedClientAddress(request: Request): string | null {
  if (process.env.VERCEL === "1") {
    return parseForwardedAddress(request.headers.get("x-forwarded-for"));
  }
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    return (
      parseForwardedAddress(request.headers.get("x-forwarded-for"), {
        allowList: true,
      }) ?? parseForwardedAddress(request.headers.get("x-real-ip"))
    );
  }
  if (process.env.NODE_ENV === "test") {
    return (
      parseForwardedAddress(request.headers.get("x-forwarded-for"), {
        allowList: true,
      }) ?? parseForwardedAddress(request.headers.get("x-real-ip"))
    );
  }
  if (process.env.NODE_ENV === "development") return "local-development";
  return null;
}

function fingerprintSecret(): string | null {
  return (
    process.env.BETA_ACCESS_COOKIE_SECRET?.trim() ||
    process.env.GUEST_ABUSE_HMAC_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    null
  );
}

export function getBetaClientFingerprint(
  request: Request,
  action: BetaAbuseAction,
): string | null {
  const address = trustedClientAddress(request);
  const secret = fingerprintSecret();
  if (!address || !secret) return null;

  return createHmac("sha256", secret)
    .update("anthon:beta-abuse:v1")
    .update("\0")
    .update(action)
    .update("\0")
    .update(address)
    .digest("hex");
}
