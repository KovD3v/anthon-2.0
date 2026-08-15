import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  buildOnboardingEntry,
  safeOnboardingNext,
} from "@/lib/onboarding/gate";
import { getOnboardingSessionDto } from "@/lib/onboarding/persistence";
import { OnboardingClient } from "./onboarding-client";

export const metadata: Metadata = {
  title: "Iniziamo | Anthon",
  description: "Prepara il tuo spazio personale con Anthon.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const nextValue = (await searchParams).next;
  const nextPath = safeOnboardingNext(
    typeof nextValue === "string" ? nextValue : undefined,
  );
  const { user } = await getAuthUser();
  if (!user) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(buildOnboardingEntry(nextPath))}`,
    );
  }
  if (user.isGuest) redirect(nextPath);
  if (user.onboardingCompletedAt) redirect(nextPath);

  const initialState = await getOnboardingSessionDto(user.id);
  return <OnboardingClient initialState={initialState} nextPath={nextPath} />;
}
