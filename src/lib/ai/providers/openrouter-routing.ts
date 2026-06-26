export const OPENROUTER_PROVIDER_ROUTING_ENV = {
  sort: "OPENROUTER_PROVIDER_SORT",
  order: "OPENROUTER_PROVIDER_ORDER",
  only: "OPENROUTER_PROVIDER_ONLY",
  ignore: "OPENROUTER_PROVIDER_IGNORE",
  allowFallbacks: "OPENROUTER_PROVIDER_ALLOW_FALLBACKS",
  requireParameters: "OPENROUTER_PROVIDER_REQUIRE_PARAMETERS",
  dataCollection: "OPENROUTER_PROVIDER_DATA_COLLECTION",
  e2eMetrics: "OPENROUTER_PROVIDER_E2E_METRICS",
  costMetrics: "OPENROUTER_PROVIDER_COST_METRICS",
  e2eInputTokens: "OPENROUTER_PROVIDER_E2E_INPUT_TOKENS",
  e2eOutputTokens: "OPENROUTER_PROVIDER_E2E_OUTPUT_TOKENS",
  e2eMaxSeconds: "OPENROUTER_PROVIDER_E2E_MAX_SECONDS",
  e2eCostWeight: "OPENROUTER_PROVIDER_E2E_COST_WEIGHT",
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

export function getOpenRouterProviderOptions(
  env: Env = process.env,
): Record<string, unknown> {
  const provider = getOpenRouterProviderRouting(env);
  return provider ? { provider } : {};
}

export function getOpenRouterProviderOptionsForModel(
  modelId: string,
  env: Env = process.env,
): Record<string, unknown> {
  const provider = getOpenRouterProviderRouting(env, modelId);
  return provider ? { provider } : {};
}

export function getOpenRouterProviderRouting(
  env: Env = process.env,
  modelId?: string,
): OpenRouterProviderRouting | undefined {
  const provider: OpenRouterProviderRouting = {};

  const sort = parseValue(env[OPENROUTER_PROVIDER_ROUTING_ENV.sort]);
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
  const eligibleMetrics =
    maxE2eSeconds === undefined
      ? metrics
      : metrics.filter(
          (metric) =>
            getE2eLatencySeconds(metric, outputTokens) <= maxE2eSeconds,
        );
  const rankedMetrics = eligibleMetrics.length > 0 ? eligibleMetrics : metrics;

  return rankedMetrics
    .map((metric) => ({
      provider: metric.provider,
      score:
        getE2eLatencySeconds(metric, outputTokens) +
        estimateProviderCost(
          metric.provider,
          costs,
          inputTokens,
          outputTokens,
        ) *
          costWeightSecondsPerDollar,
    }))
    .sort((a, b) => a.score - b.score)
    .map((metric) => metric.provider);
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

function parsePositiveNumber(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must contain positive numbers.`);
  }
  return parsed;
}
