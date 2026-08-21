import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BetaAbuseDeniedError,
  reserveBetaAction,
} from "@/lib/beta-access/abuse";
import { subscribeToBetaMailing } from "@/lib/beta-access/subscribers";
import { createLogger } from "@/lib/logger";

const betaLogger = createLogger("auth");

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Controlla email e consensi." },
      { status: 400 },
    );
  }

  try {
    await reserveBetaAction(request, "MAILING_SUBSCRIPTION");
    await subscribeToBetaMailing(
      body as Parameters<typeof subscribeToBetaMailing>[0],
    );
    return NextResponse.json({
      success: true,
      message: "Iscrizione registrata.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Controlla email e consensi." },
        { status: 400 },
      );
    }
    if (error instanceof BetaAbuseDeniedError) {
      return NextResponse.json(
        { error: "Troppi tentativi. Attendi e riprova più tardi." },
        { status: 429 },
      );
    }
    betaLogger.error(
      "beta.subscribe.error",
      "Beta mailing subscription failed",
      { error },
    );
    return NextResponse.json(
      { error: "Iscrizione temporaneamente non disponibile." },
      { status: 503 },
    );
  }
}
