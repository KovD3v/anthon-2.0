import { badRequest, serverError } from "@/lib/api/responses";
import { getOnboardingApiUser } from "@/lib/onboarding/api";
import { editOnboardingField } from "@/lib/onboarding/persistence";
import { onboardingEditSchema } from "@/lib/onboarding/schemas";

export async function POST(request: Request) {
  const auth = await getOnboardingApiUser();
  if (auth.response || !auth.user) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Corpo richiesta non valido");
  }
  const parsed = onboardingEditSchema.safeParse(body);
  if (!parsed.success) return badRequest("Campo onboarding non valido");
  try {
    return Response.json(
      await editOnboardingField({
        userId: auth.user.id,
        field: parsed.data.field,
      }),
    );
  } catch {
    return serverError("Impossibile modificare il campo");
  }
}
