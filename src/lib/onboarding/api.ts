import { forbidden, unauthorized } from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";

export async function getOnboardingApiUser() {
  const { user, error } = await getAuthUser();
  if (!user) return { user: null, response: unauthorized(error ?? undefined) };
  if (user.isGuest) {
    return {
      user: null,
      response: forbidden("L'onboarding è riservato agli account registrati"),
    };
  }
  return { user, response: null };
}
