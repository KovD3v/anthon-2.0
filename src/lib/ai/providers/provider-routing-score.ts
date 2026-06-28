export type ProviderRouteCandidate = {
  provider: string;
  e2eLatencySeconds: number;
  estimatedCostUsd?: number;
};

export type ProviderHealthSnapshot = {
  provider: string;
  successWeight?: number;
  failureWeight?: number;
  p50LatencySeconds?: number;
  p95LatencySeconds?: number;
  avgFailedAttemptLatencySeconds?: number;
  sampleCount?: number;
  consecutiveFailures?: number;
  cooldownUntil?: Date | number | string;
};

export type ProviderRoutingScoreOptions = {
  targetP95LatencySeconds?: number;
  tailRiskWeight?: number;
  costWeightSecondsPerDollar?: number;
  maxUncertaintyPenaltySeconds?: number;
  uncertaintyPriorSamples?: number;
  now?: Date;
};

export type ProviderRouteScore = {
  provider: string;
  score: number;
  components: {
    expectedLatencySeconds: number;
    tailRiskSeconds: number;
    expectedFailureCostSeconds: number;
    uncertaintyPenaltySeconds: number;
    costPenaltySeconds: number;
  };
};

const DEFAULT_TARGET_P95_LATENCY_SECONDS = 8;
const DEFAULT_TAIL_RISK_WEIGHT = 0.25;
const DEFAULT_MAX_UNCERTAINTY_PENALTY_SECONDS = 1.5;
const DEFAULT_UNCERTAINTY_PRIOR_SAMPLES = 4;
const WILSON_90_PERCENT_Z_SCORE = 1.64;

export function rankProviderRoutes(
  candidates: ProviderRouteCandidate[],
  healthByProvider: Map<string, ProviderHealthSnapshot> = new Map(),
  options: ProviderRoutingScoreOptions = {},
): ProviderRouteScore[] {
  const now = options.now ?? new Date();
  const availableCandidates = getAvailableCandidates(
    candidates,
    healthByProvider,
    now,
  );

  return availableCandidates
    .map((candidate) =>
      scoreProviderRoute(
        candidate,
        healthByProvider.get(candidate.provider),
        getBestAlternativeLatencySeconds(candidate, availableCandidates),
        options,
      ),
    )
    .sort((a, b) => a.score - b.score);
}

function getAvailableCandidates(
  candidates: ProviderRouteCandidate[],
  healthByProvider: Map<string, ProviderHealthSnapshot>,
  now: Date,
) {
  const outsideCooldown = candidates.filter(
    (candidate) =>
      !isProviderCoolingDown(healthByProvider.get(candidate.provider), now),
  );
  return outsideCooldown.length > 0 ? outsideCooldown : candidates;
}

function isProviderCoolingDown(
  health: ProviderHealthSnapshot | undefined,
  now: Date,
) {
  const cooldownUntil = parseCooldownUntil(health?.cooldownUntil);
  return cooldownUntil !== undefined && cooldownUntil.getTime() > now.getTime();
}

function parseCooldownUntil(value: Date | number | string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function scoreProviderRoute(
  candidate: ProviderRouteCandidate,
  health: ProviderHealthSnapshot | undefined,
  fallbackLatencySeconds: number,
  options: ProviderRoutingScoreOptions,
): ProviderRouteScore {
  const expectedLatencySeconds =
    health?.p50LatencySeconds ?? candidate.e2eLatencySeconds;
  const p95LatencySeconds =
    health?.p95LatencySeconds ??
    Math.max(expectedLatencySeconds, candidate.e2eLatencySeconds);
  const targetP95LatencySeconds =
    options.targetP95LatencySeconds ?? DEFAULT_TARGET_P95_LATENCY_SECONDS;
  const tailRiskSeconds =
    Math.max(0, p95LatencySeconds - targetP95LatencySeconds) *
    (options.tailRiskWeight ?? DEFAULT_TAIL_RISK_WEIGHT);
  const expectedFailureCostSeconds =
    getFailureProbabilityUpperBound(health) *
    ((health?.avgFailedAttemptLatencySeconds ?? expectedLatencySeconds) +
      fallbackLatencySeconds);
  const uncertaintyPenaltySeconds = getUncertaintyPenaltySeconds(
    health,
    options,
  );
  const costPenaltySeconds =
    (candidate.estimatedCostUsd ?? 0) *
    (options.costWeightSecondsPerDollar ?? 0);
  const score =
    expectedLatencySeconds +
    tailRiskSeconds +
    expectedFailureCostSeconds +
    uncertaintyPenaltySeconds +
    costPenaltySeconds;

  return {
    provider: candidate.provider,
    score,
    components: {
      expectedLatencySeconds,
      tailRiskSeconds,
      expectedFailureCostSeconds,
      uncertaintyPenaltySeconds,
      costPenaltySeconds,
    },
  };
}

function getBestAlternativeLatencySeconds(
  candidate: ProviderRouteCandidate,
  candidates: ProviderRouteCandidate[],
) {
  const alternativeLatencies = candidates
    .filter((item) => item.provider !== candidate.provider)
    .map((item) => item.e2eLatencySeconds)
    .sort((a, b) => a - b);
  return alternativeLatencies[0] ?? candidate.e2eLatencySeconds;
}

function getFailureProbabilityUpperBound(
  health: ProviderHealthSnapshot | undefined,
) {
  const failures = health?.failureWeight ?? 0;
  const successes = health?.successWeight ?? 0;
  const total = failures + successes;
  if (total <= 0 || failures <= 0) {
    return 0;
  }

  const observedFailureRate = failures / total;
  const zSquared = WILSON_90_PERCENT_Z_SCORE ** 2;
  return (
    (observedFailureRate +
      zSquared / (2 * total) +
      WILSON_90_PERCENT_Z_SCORE *
        Math.sqrt(
          (observedFailureRate * (1 - observedFailureRate) +
            zSquared / (4 * total)) /
            total,
        )) /
    (1 + zSquared / total)
  );
}

function getUncertaintyPenaltySeconds(
  health: ProviderHealthSnapshot | undefined,
  options: ProviderRoutingScoreOptions,
) {
  const sampleCount = health?.sampleCount ?? 0;
  const priorSamples =
    options.uncertaintyPriorSamples ?? DEFAULT_UNCERTAINTY_PRIOR_SAMPLES;
  const maxPenalty =
    options.maxUncertaintyPenaltySeconds ??
    DEFAULT_MAX_UNCERTAINTY_PENALTY_SECONDS;
  return maxPenalty * Math.sqrt(priorSamples / (sampleCount + priorSamples));
}
