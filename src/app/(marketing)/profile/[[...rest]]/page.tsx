import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { requireCompletedOnboardingPage } from "@/lib/onboarding/gate";
import { ProfileClient } from "./profile-client";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ProfilePage() {
  // TODO: Cache Components adoption. Added to unblock the build: remove this connection() to re-trigger the error and review the fix options.
  await connection();
  const { user } = await getAuthUser();
  if (!user) redirect("/sign-in?redirect_url=/profile");
  requireCompletedOnboardingPage(user, "/profile");

  return <ProfileClient />;
}
