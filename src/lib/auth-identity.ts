import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { E2E_SESSION_COOKIE_NAME, verifyE2ESessionValue } from "./e2e-runtime";

function readCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return undefined;
  for (const chunk of cookieHeader.split(";")) {
    const [name, ...valueParts] = chunk.trim().split("=");
    if (name === E2E_SESSION_COOKIE_NAME) {
      return valueParts.join("=");
    }
  }
  return undefined;
}

export async function resolveAuthenticatedClerkId(request?: Request) {
  let e2eCookie: string | undefined;
  if (request) {
    e2eCookie = readCookieHeader(request.headers.get("cookie"));
  } else {
    try {
      e2eCookie = (await cookies()).get(E2E_SESSION_COOKIE_NAME)?.value;
    } catch {
      // Unit tests and non-request server contexts may not expose headers.
    }
  }
  const e2eClerkId = verifyE2ESessionValue(e2eCookie);
  if (e2eClerkId) return e2eClerkId;

  return (await auth()).userId;
}
