import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BetaAbuseDeniedError,
  releaseBetaAction,
  reserveBetaAction,
} from "@/lib/beta-access/abuse";
import {
  BETA_ACCESS_COOKIE_NAME,
  betaAccessCookieOptions,
} from "@/lib/beta-access/cookie";
import { sanitizeBetaReturnTo } from "@/lib/beta-access/return-to";
import {
  getBetaAccessCookieSecret,
  unlockBetaAccess,
} from "@/lib/beta-access/service";
import { createLogger } from "@/lib/logger";

const betaLogger = createLogger("auth");
const unlockSchema = z.object({
  password: z.string().min(1).max(512),
  returnTo: z.string().max(2_048).optional(),
});

export async function POST(request: Request) {
  let input: z.infer<typeof unlockSchema>;
  try {
    input = unlockSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Inserisci una password valida." },
      { status: 400 },
    );
  }

  const secret = getBetaAccessCookieSecret();
  if (!secret) {
    betaLogger.error(
      "beta.unlock.config_unavailable",
      "Beta access signing configuration unavailable",
    );
    return NextResponse.json(
      { error: "Accesso beta temporaneamente non disponibile." },
      { status: 503 },
    );
  }

  try {
    const reservation = await reserveBetaAction(request, "UNLOCK");
    const result = await unlockBetaAccess(input.password, { secret });

    if (result.status === "invalid") {
      return NextResponse.json(
        { error: "Password non valida." },
        { status: 401 },
      );
    }

    if (result.status === "inactive") {
      await releaseBetaAction(reservation);
      return NextResponse.json(
        { error: "Accesso beta temporaneamente non disponibile." },
        { status: 503 },
      );
    }

    await releaseBetaAction(reservation);
    const response = NextResponse.json({
      success: true,
      returnTo: sanitizeBetaReturnTo(input.returnTo ?? null),
    });
    response.cookies.set(
      BETA_ACCESS_COOKIE_NAME,
      result.cookieValue,
      betaAccessCookieOptions(process.env.NODE_ENV === "production"),
    );
    return response;
  } catch (error) {
    if (error instanceof BetaAbuseDeniedError) {
      return NextResponse.json(
        { error: "Troppi tentativi. Attendi qualche minuto e riprova." },
        { status: 429 },
      );
    }
    betaLogger.error("beta.unlock.error", "Beta access unlock failed", {
      error,
    });
    return NextResponse.json(
      { error: "Accesso beta temporaneamente non disponibile." },
      { status: 503 },
    );
  }
}
