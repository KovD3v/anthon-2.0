import { prisma } from "@/lib/db";
import type { ModelExperimentSummary } from "./types";

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function wilson95(successes: number, total: number): [number, number] | null {
  if (total === 0) return null;
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) /
    denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function sum(values: Array<number | null>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export async function getModelExperimentSummary(
  experimentId: string,
): Promise<ModelExperimentSummary | null> {
  const experiment = await prisma.modelExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: true,
      pairs: {
        include: {
          responses: true,
          canonicalMessage: { select: { feedback: true } },
        },
      },
    },
  });
  if (!experiment) return null;

  const control = experiment.variants.find(
    (variant) => variant.role === "CONTROL",
  );
  const candidate = experiment.variants.find(
    (variant) => variant.role === "CANDIDATE",
  );
  const completedPairs = experiment.pairs.filter(
    (pair) => pair.status === "RESOLVED",
  );
  let controlVotes = 0;
  let candidateVotes = 0;
  let ties = 0;
  for (const pair of completedPairs) {
    if (pair.vote === "TIE") {
      ties++;
    } else if (pair.selectedVariantId === control?.id) {
      controlVotes++;
    } else if (pair.selectedVariantId === candidate?.id) {
      candidateVotes++;
    }
  }

  const responses = experiment.pairs.flatMap((pair) => pair.responses);
  const forRole = (variantId: string | undefined) =>
    responses.filter(
      (response) =>
        response.variantId === variantId && response.status === "COMPLETED",
    );
  const controlResponses = forRole(control?.id);
  const candidateResponses = forRole(candidate?.id);
  const latency = (items: typeof responses) => ({
    firstTokenP50: percentile(
      items.flatMap((item) =>
        item.timeToFirstTokenMs === null ? [] : [item.timeToFirstTokenMs],
      ),
      0.5,
    ),
    firstTokenP95: percentile(
      items.flatMap((item) =>
        item.timeToFirstTokenMs === null ? [] : [item.timeToFirstTokenMs],
      ),
      0.95,
    ),
    totalP50: percentile(
      items.flatMap((item) =>
        item.generationTimeMs === null ? [] : [item.generationTimeMs],
      ),
      0.5,
    ),
    totalP95: percentile(
      items.flatMap((item) =>
        item.generationTimeMs === null ? [] : [item.generationTimeMs],
      ),
      0.95,
    ),
  });
  const tokensPerSecond = (items: typeof responses) => {
    const valid = items.filter(
      (item) =>
        item.outputTokens !== null &&
        item.generationTimeMs !== null &&
        item.generationTimeMs > 0,
    );
    return valid.length === 0
      ? null
      : valid.reduce(
          (total, item) =>
            total +
            ((item.outputTokens ?? 0) * 1000) / (item.generationTimeMs ?? 1),
          0,
        ) / valid.length;
  };
  const decisive = controlVotes + candidateVotes;
  const firstDate = experiment.activatedAt ?? experiment.createdAt;
  const lastDate = experiment.completedAt ?? new Date();
  const daysRunning = Math.max(
    1,
    Math.ceil((lastDate.getTime() - firstDate.getTime()) / 86_400_000),
  );
  const feedback = experiment.pairs.flatMap((pair) =>
    pair.canonicalMessage?.feedback === null ||
    pair.canonicalMessage?.feedback === undefined
      ? []
      : [pair.canonicalMessage.feedback],
  );

  return {
    id: experiment.id,
    key: experiment.key,
    name: experiment.name,
    status: experiment.status,
    sampleSize: completedPairs.length,
    participants: new Set(completedPairs.map((pair) => pair.userId)).size,
    daysRunning,
    votes: { control: controlVotes, candidate: candidateVotes, tie: ties },
    decisiveCandidateShare: decisive === 0 ? null : candidateVotes / decisive,
    decisiveCandidateShare95: wilson95(candidateVotes, decisive),
    partialFailureRate:
      experiment.pairs.length === 0
        ? 0
        : experiment.pairs.filter((pair) => pair.status === "PARTIAL_FAILED")
            .length / experiment.pairs.length,
    failureRate:
      experiment.pairs.length === 0
        ? 0
        : experiment.pairs.filter((pair) => pair.status === "FAILED").length /
          experiment.pairs.length,
    latency: {
      control: latency(controlResponses),
      candidate: latency(candidateResponses),
    },
    cost: {
      control: sum(controlResponses.map((response) => response.costUsd)),
      candidate: sum(candidateResponses.map((response) => response.costUsd)),
      overhead: sum(
        experiment.pairs.flatMap((pair) =>
          pair.responses
            .filter((response) => response.variantId !== pair.selectedVariantId)
            .map((response) => response.costUsd),
        ),
      ),
    },
    outputTokensPerSecond: {
      control: tokensPerSecond(controlResponses),
      candidate: tokensPerSecond(candidateResponses),
    },
    canonicalFeedback: {
      positive: feedback.filter((value) => value === 1).length,
      neutral: feedback.filter((value) => value === 0).length,
      negative: feedback.filter((value) => value === -1).length,
    },
    readyForManualReview:
      completedPairs.length >= 100 &&
      new Set(completedPairs.map((pair) => pair.userId)).size >= 30 &&
      daysRunning >= 7,
  };
}
