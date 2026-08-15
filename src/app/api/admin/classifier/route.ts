import { NextResponse } from "next/server";
import {
  type AiRoutingRuntimeConfig,
  aiRoutingConfigSchema,
} from "@/lib/ai/ai-routing-config";
import {
  getAiRoutingRuntimeConfig,
  saveAiRoutingConfig,
} from "@/lib/ai/ai-routing-config-store";
import { requireAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const classifierLogger = createLogger("ai");

function serializeConfig(config: AiRoutingRuntimeConfig) {
  return {
    liveClassifierEnabled: config.liveClassifierEnabled,
    executionRoutingMode: config.executionRoutingMode,
    executionRoutingAllocationPercent: config.executionRoutingAllocationPercent,
    executionRoutingTasks: [...config.executionRoutingTasks],
    source: config.source,
    updatedAt: config.updatedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const config = await getAiRoutingRuntimeConfig();

  return NextResponse.json({
    config: serializeConfig(config),
    canEdit: Boolean(user),
  });
}

export async function PUT(request: Request) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Il corpo della richiesta non è JSON valido" },
      { status: 400 },
    );
  }

  const parsed = aiRoutingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Configurazione non valida",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await saveAiRoutingConfig(parsed.data, user.id);
    return NextResponse.json({ config: serializeConfig(config) });
  } catch (error) {
    classifierLogger.error(
      "routing_config.save_failed",
      "Failed to save AI routing configuration",
      { error, userId: user.id },
    );
    return NextResponse.json(
      { error: "Impossibile salvare la configurazione" },
      { status: 500 },
    );
  }
}
