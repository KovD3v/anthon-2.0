import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { applyBetaAccessGate } from "@/lib/beta-access/proxy-gate";
import {
  E2E_SESSION_COOKIE_NAME,
  verifyE2ESessionValue,
} from "@/lib/e2e-runtime";
import { isProtectedRoute } from "@/lib/protected-routes";

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === "/chat/usage") {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const e2eClerkId = verifyE2ESessionValue(
    req.cookies.get(E2E_SESSION_COOKIE_NAME)?.value,
  );
  if (!e2eClerkId) {
    const betaGateResponse = await applyBetaAccessGate(req);
    if (betaGateResponse) return betaGateResponse;
  }

  // This is an early UX redirect, not the authorization boundary. Protected
  // server resources must continue to check authentication themselves.
  if (!e2eClerkId && isProtectedRoute(req.nextUrl.pathname)) {
    const { userId } = await auth();

    if (!userId) {
      // Redirect to sign-in if not authenticated
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set(
        "redirect_url",
        `${req.nextUrl.pathname}${req.nextUrl.search}`,
      );
      return NextResponse.redirect(signInUrl);
    }
  }

  // Check admin routes require database lookup for role
  // We can't do DB lookups in middleware (Edge runtime limitation)
  // So admin role check happens in the admin layout/pages
  // The middleware just ensures the user is authenticated for /admin routes

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
