import { createLogger } from "@/lib/logger";
import {
  AI_ROUTING_CONFIG_ID,
  type AiRoutingConfigInput,
  type AiRoutingRuntimeConfig,
  getEnvironmentAiRoutingConfig,
  parseAiRoutingConfig,
  parsePersistedAiRoutingConfig,
} from "./ai-routing-config";

const aiRoutingLogger = createLogger("ai");
const CACHE_TTL_MS = 10_000;

type AiRoutingConfigCache = {
  config: AiRoutingRuntimeConfig;
  expiresAt: number;
};

const globalForAiRouting = globalThis as unknown as {
  aiRoutingConfigCache?: AiRoutingConfigCache;
};

function environmentRuntimeConfig(): AiRoutingRuntimeConfig {
  return {
    ...getEnvironmentAiRoutingConfig(),
    source: "environment",
    updatedAt: null,
  };
}

function cacheConfig(config: AiRoutingRuntimeConfig): AiRoutingRuntimeConfig {
  globalForAiRouting.aiRoutingConfigCache = {
    config,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return config;
}

export async function getAiRoutingRuntimeConfig(): Promise<AiRoutingRuntimeConfig> {
  const cached = globalForAiRouting.aiRoutingConfigCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const fallback = environmentRuntimeConfig();

  // Unit tests exercise routing deterministically and should not depend on a
  // database connection or on a migration being present.
  if (process.env.NODE_ENV === "test") {
    return fallback;
  }

  try {
    const { prisma } = await import("@/lib/db");
    const stored = await prisma.aiRoutingConfig.findUnique({
      where: { id: AI_ROUTING_CONFIG_ID },
      select: {
        liveClassifierEnabled: true,
        executionRoutingMode: true,
        executionRoutingAllocationPercent: true,
        executionRoutingTasks: true,
        updatedAt: true,
      },
    });

    if (!stored) {
      return cacheConfig(fallback);
    }

    const persisted = parsePersistedAiRoutingConfig(stored);
    if (!persisted) {
      aiRoutingLogger.warn(
        "routing_config.invalid",
        "Persisted AI routing configuration is invalid; using environment fallback",
      );
      return cacheConfig(fallback);
    }

    return cacheConfig({
      ...persisted,
      source: "database",
      updatedAt: stored.updatedAt,
    });
  } catch (error) {
    aiRoutingLogger.warn(
      "routing_config.read_failed",
      "Could not read persisted AI routing configuration; using environment fallback",
      { error },
    );
    return cacheConfig(fallback);
  }
}

export async function saveAiRoutingConfig(
  input: AiRoutingConfigInput,
  updatedByUserId: string,
): Promise<AiRoutingRuntimeConfig> {
  const config = parseAiRoutingConfig(input);
  const { prisma } = await import("@/lib/db");
  const stored = await prisma.aiRoutingConfig.upsert({
    where: { id: AI_ROUTING_CONFIG_ID },
    create: {
      id: AI_ROUTING_CONFIG_ID,
      ...config,
      updatedByUserId,
    },
    update: {
      ...config,
      updatedByUserId,
    },
    select: {
      liveClassifierEnabled: true,
      executionRoutingMode: true,
      executionRoutingAllocationPercent: true,
      executionRoutingTasks: true,
      updatedAt: true,
    },
  });

  return cacheConfig({
    ...config,
    source: "database",
    updatedAt: stored.updatedAt,
  });
}

export function resetAiRoutingConfigCacheForTests(): void {
  globalForAiRouting.aiRoutingConfigCache = undefined;
}
