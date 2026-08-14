import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { getSafeAuthContinuation } from "@/lib/auth-continuation";

export function safeOnboardingNext(value: string | null | undefined) {
  return getSafeAuthContinuation(value);
}

export function buildOnboardingEntry(nextPath: string) {
  return `/onboarding?next=${encodeURIComponent(safeOnboardingNext(nextPath))}`;
}

export function onboardingRequiredResponse(nextPath = "/chat") {
  return Response.json(
    {
      code: "ONBOARDING_REQUIRED",
      error: "Completa l'onboarding per continuare.",
      redirectTo: buildOnboardingEntry(nextPath),
    },
    { status: 409 },
  );
}

export function isOnboardingRequired(user: AuthUser | null) {
  return Boolean(user && !user.isGuest && user.onboardingCompletedAt === null);
}

export function requireCompletedOnboardingPage(
  user: AuthUser | null,
  nextPath = "/chat",
) {
  if (isOnboardingRequired(user)) redirect(buildOnboardingEntry(nextPath));
}
