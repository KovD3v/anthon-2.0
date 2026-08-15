import { serverError } from "@/lib/api/responses";
import { getOnboardingApiUser } from "@/lib/onboarding/api";
import {
  getOnboardingSessionDto,
  OnboardingAlreadyCompleteError,
} from "@/lib/onboarding/persistence";

export async function GET() {
  const auth = await getOnboardingApiUser();
  if (auth.response || !auth.user) return auth.response;
  try {
    return Response.json(await getOnboardingSessionDto(auth.user.id));
  } catch (error) {
    if (error instanceof OnboardingAlreadyCompleteError) {
      return Response.json(
        { code: "ONBOARDING_ALREADY_COMPLETE" },
        { status: 409 },
      );
    }
    return serverError("Impossibile caricare l'onboarding");
  }
}
