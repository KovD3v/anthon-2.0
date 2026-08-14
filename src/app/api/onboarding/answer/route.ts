import { badRequest, serverError } from "@/lib/api/responses";
import { getOnboardingApiUser } from "@/lib/onboarding/api";
import {
  applyOnboardingAnswer,
  OnboardingAlreadyCompleteError,
  OnboardingModelUnavailableError,
  OnboardingStepStaleError,
} from "@/lib/onboarding/persistence";
import { onboardingAnswerSchema } from "@/lib/onboarding/schemas";

export async function POST(request: Request) {
  const auth = await getOnboardingApiUser();
  if (auth.response || !auth.user) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Corpo richiesta non valido");
  }
  const parsed = onboardingAnswerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Risposta onboarding non valida");
  try {
    return Response.json(
      await applyOnboardingAnswer({
        userId: auth.user.id,
        expectedStep: parsed.data.expectedStep,
        userText: parsed.data.text,
        skip: parsed.data.skip,
        requestId: parsed.data.requestId,
      }),
    );
  } catch (error) {
    if (error instanceof OnboardingStepStaleError) {
      return Response.json({ code: "ONBOARDING_STEP_STALE" }, { status: 409 });
    }
    if (error instanceof OnboardingAlreadyCompleteError) {
      return Response.json(
        { code: "ONBOARDING_ALREADY_COMPLETE" },
        { status: 409 },
      );
    }
    if (error instanceof OnboardingModelUnavailableError) {
      return Response.json(
        { code: "ONBOARDING_MODEL_UNAVAILABLE", error: "Riprova tra poco." },
        { status: 503 },
      );
    }
    return serverError("Impossibile salvare la risposta");
  }
}
