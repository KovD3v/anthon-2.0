import { type NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { BETA_ACCESS_COOKIE_NAME, betaAccessCookieOptions } from "./cookie";
import { sanitizeBetaReturnTo } from "./return-to";
import {
  classifyBetaGatePath,
  isAdminAuthBootstrapRequest,
} from "./route-policy";
import {
  getBetaAccessCookieSecret,
  isCurrentBetaAccessCookie,
  loadBetaAccessConfig,
} from "./service";

const betaLogger = createLogger("auth");

function expireCredential(response: NextResponse, request: NextRequest) {
  if (!request.cookies.has(BETA_ACCESS_COOKIE_NAME)) return;
  response.cookies.set(BETA_ACCESS_COOKIE_NAME, "", {
    ...betaAccessCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
}

function unavailableResponse(
  request: NextRequest,
  kind: "page" | "api",
): NextResponse {
  if (kind === "api") {
    return NextResponse.json(
      { error: "Beta access temporarily unavailable" },
      { status: 503 },
    );
  }
  const url = new URL("/beta-access", request.url);
  url.searchParams.set("error", "unavailable");
  url.searchParams.set(
    "returnTo",
    sanitizeBetaReturnTo(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    ),
  );
  const response = NextResponse.redirect(url);
  expireCredential(response, request);
  return response;
}

export async function applyBetaAccessGate(
  request: NextRequest,
): Promise<NextResponse | null> {
  const kind = classifyBetaGatePath(request.nextUrl.pathname);
  if (kind === "public" || isAdminAuthBootstrapRequest(request.nextUrl)) {
    return null;
  }

  let config: Awaited<ReturnType<typeof loadBetaAccessConfig>>;
  try {
    config = await loadBetaAccessConfig();
  } catch (error) {
    betaLogger.error(
      "beta.gate.config_unavailable",
      "Beta access configuration lookup failed",
      { error },
    );
    return unavailableResponse(request, kind);
  }
  if (!config.active) return null;

  const secret = getBetaAccessCookieSecret();
  if (!secret) {
    betaLogger.error(
      "beta.gate.secret_unavailable",
      "Beta access signing configuration unavailable",
    );
    return unavailableResponse(request, kind);
  }

  const cookieValue =
    request.cookies.get(BETA_ACCESS_COOKIE_NAME)?.value ?? null;
  if (
    isCurrentBetaAccessCookie(cookieValue, config.accessVersion, { secret })
  ) {
    return null;
  }

  if (kind === "api") {
    const response = NextResponse.json(
      { error: "Beta access required" },
      { status: 403 },
    );
    expireCredential(response, request);
    return response;
  }

  const returnTo = sanitizeBetaReturnTo(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const url = new URL("/beta-access", request.url);
  url.searchParams.set("returnTo", returnTo);
  const response = NextResponse.redirect(url);
  expireCredential(response, request);
  return response;
}
