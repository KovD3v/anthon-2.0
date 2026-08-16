import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import {
  loadBetaAccessConfig,
  rotateBetaAccessPassword,
} from "@/lib/beta-access/service";
import { createLogger } from "@/lib/logger";

const betaLogger = createLogger("auth");
const rotationSchema = z
  .object({
    password: z.string().min(12).max(512),
    confirmation: z.string().min(12).max(512),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "Passwords must match",
  });

export async function GET() {
  const { errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;

  try {
    const config = await loadBetaAccessConfig();
    if (!config.active) return NextResponse.json({ active: false });
    return NextResponse.json({
      active: true,
      accessVersion: config.accessVersion,
      activatedAt: config.activatedAt.toISOString(),
      rotatedAt: config.rotatedAt.toISOString(),
    });
  } catch (error) {
    betaLogger.error(
      "beta.admin.config_read_failed",
      "Beta access admin configuration read failed",
      { error },
    );
    return NextResponse.json(
      { error: "Impossibile caricare la configurazione beta." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const { user, errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: z.infer<typeof rotationSchema>;
  try {
    input = rotationSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        error: "Usa almeno 12 caratteri e conferma la stessa password beta.",
      },
      { status: 400 },
    );
  }

  try {
    const config = await rotateBetaAccessPassword(input.password, user.id);
    return NextResponse.json({
      active: true,
      accessVersion: config.accessVersion,
      activatedAt: config.activatedAt.toISOString(),
      rotatedAt: config.rotatedAt.toISOString(),
    });
  } catch (error) {
    betaLogger.error(
      "beta.admin.rotation_failed",
      "Beta access password rotation failed",
      { error, actorUserId: user.id },
    );
    return NextResponse.json(
      { error: "Impossibile aggiornare la password beta." },
      { status: 500 },
    );
  }
}
