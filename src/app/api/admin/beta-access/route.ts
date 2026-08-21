import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import {
  type BetaAccessConfigState,
  type BetaAccessConfigSummary,
  loadBetaAccessConfig,
  rotateBetaAccessPassword,
  setBetaAccessEnabled,
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
const toggleSchema = z.object({ active: z.boolean() });

function serializeConfig(
  config: BetaAccessConfigState | BetaAccessConfigSummary,
) {
  if (!config.configured) return { configured: false, active: false } as const;
  return {
    configured: true,
    active: config.active,
    accessVersion: config.accessVersion,
    activatedAt: config.activatedAt.toISOString(),
    rotatedAt: config.rotatedAt.toISOString(),
  } as const;
}

export async function GET() {
  const { errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;

  try {
    const config = await loadBetaAccessConfig();
    return NextResponse.json(serializeConfig(config));
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
    return NextResponse.json(serializeConfig(config));
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

export async function PUT(request: Request) {
  const { user, errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: z.infer<typeof toggleSchema>;
  try {
    input = toggleSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Indica se la beta privata deve essere attiva." },
      { status: 400 },
    );
  }

  try {
    const result = await setBetaAccessEnabled(input.active, user.id);
    if (result.status === "unconfigured") {
      return NextResponse.json(
        { error: "Configura prima una password beta." },
        { status: 409 },
      );
    }
    return NextResponse.json(serializeConfig(result.config));
  } catch (error) {
    betaLogger.error(
      "beta.admin.toggle_failed",
      "Beta access activation toggle failed",
      { error, actorUserId: user.id, active: input.active },
    );
    return NextResponse.json(
      { error: "Impossibile modificare lo stato della beta privata." },
      { status: 500 },
    );
  }
}
