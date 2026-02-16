import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes that require authentication
// Note: /chat is NOT protected - guests can access via cookie-based auth
const isProtectedRoute = createRouteMatcher([
  "/profile(.*)",
  "/settings(.*)",
  "/admin(.*)",
  "/channels(.*)",
  "/organization(.*)",
  "/organizzation(.*)",
]);

// Routes that require admin role
const _isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Protect routes that require authentication
  if (isProtectedRoute(req)) {
    if (!userId) {
      // Redirect to sign-in if not authenticated
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
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
