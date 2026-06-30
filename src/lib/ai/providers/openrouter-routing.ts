import type { JSONObject } from "@ai-sdk/provider";
import {
  type ProviderHealthSnapshot,
  rankProviderRoutes,
} from "./provider-routing-score";

export const OPENROUTER_PROVIDER_ROUTING_ENV = {
  sort: "OPENROUTER_PROVIDER_SORT",
  order: "OPENROUTER_PROVIDER_ORDER",
  only: "OPENROUTER_PROVIDER_ONLY",
  ignore: "OPENROUTER_PROVIDER_IGNORE",
  allowFallbacks: "OPENROUTER_PROVIDER_ALLOW_FALLBACKS",
  requireParameters: "OPENROUTER_PROVIDER_REQUIRE_PARAMETERS",
  dataCollection: "OPENROUTER_PROVIDER_DATA_COLLECTION",
  quantizations: "OPENROUTER_PROVIDER_QUANTIZATIONS",
  maxPromptPrice: "OPENROUTER_PROVIDER_MAX_PROMPT_PRICE",
  maxCompletionPrice: "OPENROUTER_PROVIDER_MAX_COMPLETION_PRICE",
  maxImagePrice: "OPENROUTER_PROVIDER_MAX_IMAGE_PRICE",
  maxAudioPrice: "OPENROUTER_PROVIDER_MAX_AUDIO_PRICE",
  maxRequestPrice: "OPENROUTER_PROVIDER_MAX_REQUEST_PRICE",
  zdr: "OPENROUTER_PROVIDER_ZDR",
  e2eMetrics: "OPENROUTER_PROVIDER_E2E_METRICS",
  costMetrics: "OPENROUTER_PROVIDER_COST_METRICS",
  e2eInputTokens: "OPENROUTER_PROVIDER_E2E_INPUT_TOKENS",
  e2eOutputTokens: "OPENROUTER_PROVIDER_E2E_OUTPUT_TOKENS",
  e2eMaxSeconds: "OPENROUTER_PROVIDER_E2E_MAX_SECONDS",
  e2eCostWeight: "OPENROUTER_PROVIDER_E2E_COST_WEIGHT",
  recentErrors: "OPENROUTER_PROVIDER_RECENT_ERRORS",
  providerHealth: "OPENROUTER_PROVIDER_HEALTH",
  routingNow: "OPENROUTER_PROVIDER_ROUTING_NOW",
} as const;

type Env = Record<string, string | undefined>;

export type OpenRouterProviderRouting = {
  sort?: "price" | "throughput" | "latency";
  order?: string[];
  only?: string[];
  ignore?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: "allow" | "deny";
  quantizations?: string[];
  max_price?: {
    prompt?: number;
    completion?: number;
    image?: number;
    audio?: number;
    request?: number;
  };
  zdr?: boolean;
};

type ProviderPerformance = {
  modelId?: string;
  provider: string;
  latencySeconds?: number;
  throughputTokensPerSecond?: number;
  e2eLatencySeconds?: number;
};

type ProviderCost = {
  modelId?: string;
  provider: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
};

const PROVIDER_OPTIONS_CACHE_MAX_ENTRIES = 200;
const RECENT_ERROR_LIGHT_PENALTY_SECONDS = 8;
const RECENT_ERROR_STRONG_PENALTY_SECONDS = 25;
const RECENT_ERROR_COOLDOWN_THRESHOLD = 3;
const GLM_5_2_MODEL_ID = "z-ai/glm-5.2";
const GLM_5_2_DEFAULT_PROVIDER_E2E_METRICS =
  "z-ai/glm-5.2=Parasail:0.523,z-ai/glm-5.2=AkashML:1.1,z-ai/glm-5.2=Wafer:5.1";
const GLM_5_2_DEFAULT_PROVIDER_HEALTH = {
  [GLM_5_2_MODEL_ID]: {
    Parasail: {
      successWeight: 1,
      p50LatencySeconds: 0.523,
      p95LatencySeconds: 0.523,
      sampleCount: 1,
    },
    AkashML: {
      failureWeight: 1,
      avgFailedAttemptLatencySeconds: 1.1,
      sampleCount: 1,
    },
    Wafer: {
      failureWeight: 1,
      avgFailedAttemptLatencySeconds: 5.1,
      sampleCount: 1,
    },
  },
} satisfies Record<string, Record<string, ProviderHealthSnapshot>>;
const providerOptionsCache = new Map<string, JSONObject>();

export function getOpenRouterProviderOptions(
  env: Env = process.env,
): JSONObject {
  return getCachedOpenRouterProviderOptions(env);
}

export function getOpenRouterProviderOptionsForModel(
  modelId: string,
  env: Env = process.env,
): JSONObject {
  return getCachedOpenRouterProviderOptions(env, modelId);
}

function getCachedOpenRouterProviderOptions(
  env: Env,
  modelId?: string,
): JSONObject {
  const effectiveEnv = withDefaultProviderRouting(env, modelId);
  const cacheKey = getProviderOptionsCacheKey(effectiveEnv, modelId);
  const cachedOptions = providerOptionsCache.get(cacheKey);
  if (cachedOptions) {
    return cachedOptions;
  }

  const provider = getOpenRouterProviderRouting(effectiveEnv, modelId);
  const options: JSONObject = provider ? { provider } : {};
  providerOptionsCache.set(cacheKey, options);
  if (providerOptionsCache.size > PROVIDER_OPTIONS_CACHE_MAX_ENTRIES) {
    const oldestKey = providerOptionsCache.keys().next().value;
    if (oldestKey) {
      providerOptionsCache.delete(oldestKey);
    }
  }
  return options;
}

function withDefaultProviderRouting(
  env: Env,
  modelId: string | undefined,
): Env {
  if (modelId !== GLM_5_2_MODEL_ID || hasExplicitProviderRouting(env)) {
    return env;
  }

  return {
    ...env,
    [OPENROUTER_PROVIDER_ROUTING_ENV.sort]: "e2e-latency",
    [OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics]:
      GLM_5_2_DEFAULT_PROVIDER_E2E_METRICS,
    [OPENROUTER_PROVIDER_ROUTING_ENV.providerHealth]: JSON.stringify(
      GLM_5_2_DEFAULT_PROVIDER_HEALTH,
    ),
  };
}

function hasExplicitProviderRouting(env: Env) {
  return Object.values(OPENROUTER_PROVIDER_ROUTING_ENV).some((name) =>
    parseValue(env[name]),
  );
}

function getProviderOptionsCacheKey(env: Env, modelId: string | undefined) {
  return JSON.stringify({
    modelId: modelId ?? null,
    values: Object.values(OPENROUTER_PROVIDER_ROUTING_ENV).map((name) => [
      name,
      env[name],
    ]),
  });
}

export function getOpenRouterProviderRouting(
  env: Env = process.env,
  modelId?: string,
): OpenRouterProviderRouting | undefined {
  const provider: OpenRouterProviderRouting = {};

  const sort =
    parseValue(env[OPENROUTER_PROVIDER_ROUTING_ENV.sort]) ?? "latency";
  if (sort === "e2e-latency") {
    provider.order = buildE2eLatencyProviderOrder(env, modelId);
    if (parseValue(env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eMaxSeconds])) {
      provider.only = provider.order;
    }
  } else if (sort) {
    provider.sort = parseProviderSort(sort);
  }

  const order = parseList(env[OPENROUTER_PROVIDER_ROUTING_ENV.order]);
  if (order.length > 0) {
    provider.order = order;
  }

  const only = parseList(env[OPENROUTER_PROVIDER_ROUTING_ENV.only]);
  if (only.length > 0) {
    provider.only = only;
  }

  const ignore = parseList(env[OPENROUTER_PROVIDER_ROUTING_ENV.ignore]);
  if (ignore.length > 0) {
    provider.ignore = ignore;
  }

  const allowFallbacks = parseBoolean(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.allowFallbacks],
    OPENROUTER_PROVIDER_ROUTING_ENV.allowFallbacks,
  );
  if (allowFallbacks !== undefined) {
    provider.allow_fallbacks = allowFallbacks;
  }

  const requireParameters = parseBoolean(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.requireParameters],
    OPENROUTER_PROVIDER_ROUTING_ENV.requireParameters,
  );
  if (requireParameters !== undefined) {
    provider.require_parameters = requireParameters;
  }

  const dataCollection = parseValue(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.dataCollection],
  );
  if (dataCollection) {
    if (dataCollection !== "allow" && dataCollection !== "deny") {
      throw new Error(
        `${OPENROUTER_PROVIDER_ROUTING_ENV.dataCollection} must be "allow" or "deny".`,
      );
    }
    provider.data_collection = dataCollection;
  }

  const quantizations = parseList(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.quantizations],
  );
  if (quantizations.length > 0) {
    provider.quantizations = quantizations;
  }

  const maxPrice = parseMaxPrice(env);
  if (Object.keys(maxPrice).length > 0) {
    provider.max_price = maxPrice;
  }

  const zdr = parseBoolean(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.zdr],
    OPENROUTER_PROVIDER_ROUTING_ENV.zdr,
  );
  if (zdr !== undefined) {
    provider.zdr = zdr;
  }

  if (sort !== "e2e-latency") {
    penalizeRecentErrorProviders(provider, env, modelId);
  }

  return Object.keys(provider).length > 0 ? provider : undefined;
}

function parseValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseList(value: string | undefined) {
  return (
    parseValue(value)
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function parseBoolean(value: string | undefined, name: string) {
  const normalized = parseValue(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

function parseProviderSort(value: string) {
  if (value === "price" || value === "throughput" || value === "latency") {
    return value;
  }
  throw new Error(
    `${OPENROUTER_PROVIDER_ROUTING_ENV.sort} must be price, throughput, latency, or e2e-latency.`,
  );
}

function parseMaxPrice(
  env: Env,
): NonNullable<OpenRouterProviderRouting["max_price"]> {
  const maxPrice: NonNullable<OpenRouterProviderRouting["max_price"]> = {};
  const prompt = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.maxPromptPrice],
    OPENROUTER_PROVIDER_ROUTING_ENV.maxPromptPrice,
  );
  const completion = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.maxCompletionPrice],
    OPENROUTER_PROVIDER_ROUTING_ENV.maxCompletionPrice,
  );
  const image = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.maxImagePrice],
    OPENROUTER_PROVIDER_ROUTING_ENV.maxImagePrice,
  );
  const audio = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.maxAudioPrice],
    OPENROUTER_PROVIDER_ROUTING_ENV.maxAudioPrice,
  );
  const request = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.maxRequestPrice],
    OPENROUTER_PROVIDER_ROUTING_ENV.maxRequestPrice,
  );

  if (prompt !== undefined) {
    maxPrice.prompt = prompt;
  }
  if (completion !== undefined) {
    maxPrice.completion = completion;
  }
  if (image !== undefined) {
    maxPrice.image = image;
  }
  if (audio !== undefined) {
    maxPrice.audio = audio;
  }
  if (request !== undefined) {
    maxPrice.request = request;
  }

  return maxPrice;
}

function penalizeRecentErrorProviders(
  provider: OpenRouterProviderRouting,
  env: Env,
  modelId: string | undefined,
) {
  const recentErrors = parseRecentErrorCounts(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.recentErrors],
    modelId,
  );
  if (recentErrors.size === 0) {
    return;
  }

  provider.order = rankProvidersWithRecentErrors(provider.order, recentErrors);
  provider.only = rankProvidersWithRecentErrors(provider.only, recentErrors);
}

function parseRecentErrorCounts(
  value: string | undefined,
  modelId: string | undefined,
) {
  const counts = new Map<string, number>();
  for (const row of filterProviderRowsByModel(parseList(value), modelId)) {
    const [providerWithScope, countValue] = row
      .split(":")
      .map((item) => item.trim());
    const { provider } = parseScopedProvider(providerWithScope ?? "");
    if (!provider) {
      continue;
    }
    const count = countValue
      ? parsePositiveInteger(
          countValue,
          OPENROUTER_PROVIDER_ROUTING_ENV.recentErrors,
        )
      : 1;
    counts.set(provider, count);
  }
  return counts;
}

function rankProvidersWithRecentErrors(
  providers: string[] | undefined,
  recentErrors: Map<string, number>,
) {
  if (!providers) {
    return undefined;
  }

  const providersOutsideCooldown = providers.filter(
    (provider) =>
      (recentErrors.get(provider) ?? 0) < RECENT_ERROR_COOLDOWN_THRESHOLD,
  );
  const eligibleProviders =
    providersOutsideCooldown.length > 0 ? providersOutsideCooldown : providers;

  return eligibleProviders
    .map((provider, index) => ({
      provider,
      score: index + getRecentErrorPenaltySeconds(recentErrors.get(provider)),
    }))
    .sort((a, b) => a.score - b.score)
    .map(({ provider }) => provider);
}

function getRecentErrorPenaltySeconds(count: number | undefined) {
  if (!count) {
    return 0;
  }
  if (count === 1) {
    return RECENT_ERROR_LIGHT_PENALTY_SECONDS;
  }
  if (count < RECENT_ERROR_COOLDOWN_THRESHOLD) {
    return RECENT_ERROR_STRONG_PENALTY_SECONDS;
  }
  return Number.POSITIVE_INFINITY;
}

function buildE2eLatencyProviderOrder(env: Env, modelId: string | undefined) {
  const metrics = parseProviderPerformanceMetrics(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics],
    modelId,
  );
  if (metrics.length === 0) {
    throw new Error(
      `${OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics} is required when ${OPENROUTER_PROVIDER_ROUTING_ENV.sort}=e2e-latency.`,
    );
  }

  const outputTokens = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eOutputTokens],
    OPENROUTER_PROVIDER_ROUTING_ENV.e2eOutputTokens,
  );
  const inputTokens = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eInputTokens],
    OPENROUTER_PROVIDER_ROUTING_ENV.e2eInputTokens,
  );
  const maxE2eSeconds = parseOptionalPositiveNumber(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eMaxSeconds],
    OPENROUTER_PROVIDER_ROUTING_ENV.e2eMaxSeconds,
  );
  const costWeightSecondsPerDollar =
    parseOptionalPositiveNumber(
      env[OPENROUTER_PROVIDER_ROUTING_ENV.e2eCostWeight],
      OPENROUTER_PROVIDER_ROUTING_ENV.e2eCostWeight,
    ) ?? 100;
  const costs = parseProviderCostMetrics(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.costMetrics],
    modelId,
  );
  const now = parseOptionalDate(
    env[OPENROUTER_PROVIDER_ROUTING_ENV.routingNow],
  );
  const healthByProvider = mergeProviderHealthSnapshots(
    parseProviderHealthSnapshots(
      env[OPENROUTER_PROVIDER_ROUTING_ENV.providerHealth],
      modelId,
    ),
    parseRecentErrorHealthSnapshots(
      env[OPENROUTER_PROVIDER_ROUTING_ENV.recentErrors],
      modelId,
      now,
    ),
  );
  const eligibleMetrics =
    maxE2eSeconds === undefined
      ? metrics
      : metrics.filter(
          (metric) =>
            getE2eLatencySeconds(metric, outputTokens) <= maxE2eSeconds,
        );
  const rankedMetrics = eligibleMetrics.length > 0 ? eligibleMetrics : metrics;

  return rankProviderRoutes(
    rankedMetrics.map((metric) => ({
      provider: metric.provider,
      e2eLatencySeconds: getE2eLatencySeconds(metric, outputTokens),
      estimatedCostUsd: estimateProviderCost(
        metric.provider,
        costs,
        inputTokens,
        outputTokens,
      ),
    })),
    healthByProvider,
    { costWeightSecondsPerDollar, now },
  ).map((metric) => metric.provider);
}

function getE2eLatencySeconds(
  metric: ProviderPerformance,
  outputTokens: number | undefined,
) {
  return (
    metric.e2eLatencySeconds ?? estimateE2eLatencySeconds(metric, outputTokens)
  );
}

function parseProviderCostMetrics(
  value: string | undefined,
  modelId: string | undefined,
) {
  const costs = new Map<string, ProviderCost>();
  for (const row of filterProviderRowsByModel(parseList(value), modelId)) {
    const [providerWithScope, inputCost, outputCost] = row
      .split(":")
      .map((item) => item.trim());
    const { rowModelId, provider } = parseScopedProvider(providerWithScope);
    if (!provider || !inputCost || !outputCost) {
      throw new Error(
        `${OPENROUTER_PROVIDER_ROUTING_ENV.costMetrics} rows must be provider:inputCostPerToken:outputCostPerToken or modelId=provider:inputCostPerToken:outputCostPerToken.`,
      );
    }
    costs.set(provider, {
      modelId: rowModelId,
      provider,
      inputCostPerToken: parsePositiveNumber(
        inputCost,
        OPENROUTER_PROVIDER_ROUTING_ENV.costMetrics,
      ),
      outputCostPerToken: parsePositiveNumber(
        outputCost,
        OPENROUTER_PROVIDER_ROUTING_ENV.costMetrics,
      ),
    });
  }
  return costs;
}

function estimateProviderCost(
  provider: string,
  costs: Map<string, ProviderCost>,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
) {
  const cost = costs.get(provider);
  if (!cost || inputTokens === undefined || outputTokens === undefined) {
    return 0;
  }
  return (
    inputTokens * cost.inputCostPerToken +
    outputTokens * cost.outputCostPerToken
  );
}

function parseProviderHealthSnapshots(
  value: string | undefined,
  modelId: string | undefined,
) {
  const healthByProvider = new Map<string, ProviderHealthSnapshot>();
  const parsedValue = parseJsonObject(
    value,
    OPENROUTER_PROVIDER_ROUTING_ENV.providerHealth,
  );
  if (!parsedValue) {
    return healthByProvider;
  }

  addProviderHealthEntries(healthByProvider, parsedValue);
  if (modelId) {
    const modelScopedValue = getRecordValue(parsedValue, modelId);
    addProviderHealthEntries(healthByProvider, modelScopedValue);
  }

  return healthByProvider;
}

function parseRecentErrorHealthSnapshots(
  value: string | undefined,
  modelId: string | undefined,
  now: Date | undefined,
) {
  const healthByProvider = new Map<string, ProviderHealthSnapshot>();
  const cooldownUntil = new Date((now ?? new Date()).getTime() + 5 * 60 * 1000);

  for (const row of filterProviderRowsByModel(parseList(value), modelId)) {
    const [providerWithScope, countValue] = row
      .split(":")
      .map((item) => item.trim());
    const { provider } = parseScopedProvider(providerWithScope ?? "");
    if (!provider) {
      continue;
    }
    const failureWeight = countValue
      ? parsePositiveInteger(
          countValue,
          OPENROUTER_PROVIDER_ROUTING_ENV.recentErrors,
        )
      : 1;
    healthByProvider.set(provider, {
      provider,
      failureWeight,
      sampleCount: failureWeight,
      consecutiveFailures: failureWeight,
      cooldownUntil:
        failureWeight >= RECENT_ERROR_COOLDOWN_THRESHOLD
          ? cooldownUntil
          : undefined,
    });
  }

  return healthByProvider;
}

function mergeProviderHealthSnapshots(
  ...sources: Map<string, ProviderHealthSnapshot>[]
) {
  const merged = new Map<string, ProviderHealthSnapshot>();
  for (const source of sources) {
    for (const [provider, health] of source) {
      merged.set(provider, mergeProviderHealth(merged.get(provider), health));
    }
  }
  return merged;
}

function mergeProviderHealth(
  existing: ProviderHealthSnapshot | undefined,
  incoming: ProviderHealthSnapshot,
): ProviderHealthSnapshot {
  if (!existing) {
    return incoming;
  }

  return {
    provider: incoming.provider,
    successWeight:
      (existing.successWeight ?? 0) + (incoming.successWeight ?? 0),
    failureWeight:
      (existing.failureWeight ?? 0) + (incoming.failureWeight ?? 0),
    p50LatencySeconds: incoming.p50LatencySeconds ?? existing.p50LatencySeconds,
    p95LatencySeconds: incoming.p95LatencySeconds ?? existing.p95LatencySeconds,
    avgFailedAttemptLatencySeconds:
      incoming.avgFailedAttemptLatencySeconds ??
      existing.avgFailedAttemptLatencySeconds,
    sampleCount: (existing.sampleCount ?? 0) + (incoming.sampleCount ?? 0),
    consecutiveFailures: Math.max(
      existing.consecutiveFailures ?? 0,
      incoming.consecutiveFailures ?? 0,
    ),
    cooldownUntil: maxDateLike(existing.cooldownUntil, incoming.cooldownUntil),
  };
}

function addProviderHealthEntries(
  healthByProvider: Map<string, ProviderHealthSnapshot>,
  value: unknown,
) {
  const record = getRecord(value);
  if (!record) {
    return;
  }

  for (const [provider, rawHealth] of Object.entries(record)) {
    const healthRecord = getRecord(rawHealth);
    if (!healthRecord || !looksLikeProviderHealth(healthRecord)) {
      continue;
    }
    healthByProvider.set(provider, {
      provider,
      successWeight: getOptionalNumber(healthRecord.successWeight),
      failureWeight: getOptionalNumber(healthRecord.failureWeight),
      p50LatencySeconds: getOptionalNumber(healthRecord.p50LatencySeconds),
      p95LatencySeconds: getOptionalNumber(healthRecord.p95LatencySeconds),
      avgFailedAttemptLatencySeconds: getOptionalNumber(
        healthRecord.avgFailedAttemptLatencySeconds,
      ),
      sampleCount: getOptionalNumber(healthRecord.sampleCount),
      consecutiveFailures: getOptionalNumber(healthRecord.consecutiveFailures),
      cooldownUntil: getOptionalDateLike(healthRecord.cooldownUntil),
    });
  }
}

function looksLikeProviderHealth(record: Record<string, unknown>) {
  return [
    "successWeight",
    "failureWeight",
    "p50LatencySeconds",
    "p95LatencySeconds",
    "avgFailedAttemptLatencySeconds",
    "sampleCount",
    "consecutiveFailures",
    "cooldownUntil",
  ].some((key) => key in record);
}

function parseJsonObject(value: string | undefined, name: string) {
  const rawValue = parseValue(value);
  if (!rawValue) {
    return undefined;
  }
  try {
    return getRecord(JSON.parse(rawValue));
  } catch {
    throw new Error(`${name} must be valid JSON.`);
  }
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return getRecord(record[key]);
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getOptionalDateLike(value: unknown) {
  if (
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  return undefined;
}

function maxDateLike(
  first: ProviderHealthSnapshot["cooldownUntil"],
  second: ProviderHealthSnapshot["cooldownUntil"],
) {
  const firstDate = parseOptionalDate(first);
  const secondDate = parseOptionalDate(second);
  if (!firstDate) {
    return second;
  }
  if (!secondDate) {
    return first;
  }
  return firstDate.getTime() >= secondDate.getTime() ? first : second;
}

function parseProviderPerformanceMetrics(
  value: string | undefined,
  modelId: string | undefined,
) {
  const rawRows = filterProviderRowsByModel(parseList(value), modelId);
  return rawRows.map((row) => {
    const [providerWithScope, latencyOrE2e, throughput, e2e] = row
      .split(":")
      .map((item) => item.trim());
    const { rowModelId, provider } = parseScopedProvider(providerWithScope);
    if (!provider || !latencyOrE2e) {
      throw new Error(
        `${OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics} rows must be provider:e2eLatencySeconds, modelId=provider:e2eLatencySeconds, provider:latencySeconds:throughputTokensPerSecond[:e2eLatencySeconds], or modelId=provider:latencySeconds:throughputTokensPerSecond[:e2eLatencySeconds].`,
      );
    }

    const metric: ProviderPerformance = {
      modelId: rowModelId,
      provider,
    };

    if (!throughput) {
      metric.e2eLatencySeconds = parsePositiveNumber(
        latencyOrE2e,
        OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics,
      );
      return metric;
    }

    metric.latencySeconds = parsePositiveNumber(
      latencyOrE2e,
      OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics,
    );
    metric.throughputTokensPerSecond = parsePositiveNumber(
      throughput,
      OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics,
    );

    if (e2e) {
      metric.e2eLatencySeconds = parsePositiveNumber(
        e2e,
        OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics,
      );
    }

    return metric;
  });
}

function filterProviderRowsByModel(
  rows: string[],
  modelId: string | undefined,
) {
  const matchingRows = new Map<
    string,
    { row: string; isModelSpecific: boolean }
  >();

  for (const row of rows) {
    const [providerWithScope] = row.split(":");
    const scopedProvider = parseScopedProvider(providerWithScope?.trim() ?? "");
    if (scopedProvider.rowModelId && scopedProvider.rowModelId !== modelId) {
      continue;
    }
    const isModelSpecific = Boolean(scopedProvider.rowModelId);
    const existing = matchingRows.get(scopedProvider.provider);
    if (existing?.isModelSpecific && !isModelSpecific) {
      continue;
    }
    matchingRows.set(scopedProvider.provider, { row, isModelSpecific });
  }

  return Array.from(matchingRows.values()).map(({ row }) => row);
}

function parseScopedProvider(value: string) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) {
    return { provider: value };
  }

  return {
    rowModelId: value.slice(0, separatorIndex).trim() || undefined,
    provider: value.slice(separatorIndex + 1).trim(),
  };
}

function estimateE2eLatencySeconds(
  metric: ProviderPerformance,
  outputTokens: number | undefined,
) {
  if (
    metric.latencySeconds === undefined ||
    metric.throughputTokensPerSecond === undefined
  ) {
    throw new Error(
      `${OPENROUTER_PROVIDER_ROUTING_ENV.e2eMetrics} rows without e2eLatencySeconds must include latencySeconds and throughputTokensPerSecond.`,
    );
  }

  return (
    metric.latencySeconds +
    (outputTokens ?? 0) / metric.throughputTokensPerSecond
  );
}

function parseOptionalPositiveNumber(value: string | undefined, name: string) {
  const parsedValue = parseValue(value);
  return parsedValue ? parsePositiveNumber(parsedValue, name) : undefined;
}

function parseOptionalDate(value: Date | number | string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function parsePositiveNumber(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must contain positive numbers.`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, name: string) {
  const parsed = parsePositiveNumber(value, name);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must contain positive integers.`);
  }
  return parsed;
}
