import { serverError } from "@/lib/api/responses";
import { getOnboardingApiUser } from "@/lib/onboarding/api";
import {
  confirmOnboarding,
  OnboardingAlreadyCompleteError,
  OnboardingNotReadyError,
} from "@/lib/onboarding/persistence";

export async function POST() {
  const auth = await getOnboardingApiUser();
  if (auth.response || !auth.user) return auth.response;
  try {
    return Response.json(await confirmOnboarding(auth.user.id));
  } catch (error) {
    if (error instanceof OnboardingAlreadyCompleteError) {
      return Response.json(
        { code: "ONBOARDING_ALREADY_COMPLETE" },
        { status: 409 },
      );
    }
    if (error instanceof OnboardingNotReadyError) {
      return Response.json({ code: "ONBOARDING_NOT_READY" }, { status: 409 });
    }
    return serverError("Impossibile completare l'onboarding");
  }
}
