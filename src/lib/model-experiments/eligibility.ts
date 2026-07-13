import {
  matchesHealthRiskIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryWriteIntent,
  matchesNotesWriteIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesVoiceIntent,
  shouldEnableWebFetchTool,
  shouldEnableWebSearchTool,
} from "@/lib/ai/intent";
import type { TurnPlan } from "@/lib/ai/turn-plan";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

const logger = createLogger("ai");

export type StaticEligibilityInput = {
  countryCode: string | null;
  channel: string;
  clerkId: string | null;
  isGuest: boolean;
  role: string;
  hasAttachments: boolean;
  responseMode: "text" | "voice";
};

export function checkStaticModelComparisonEligibility(
  input: StaticEligibilityInput,
) {
  if (input.channel !== "WEB") return false;
  if (!input.clerkId || input.isGuest) return false;
  if (input.role === "ADMIN" || input.role === "SUPER_ADMIN") return false;
  if (input.countryCode?.toUpperCase() !== "IT") return false;
  if (input.hasAttachments || input.responseMode !== "text") return false;
  return true;
}

export function isParticipantCadenceEligible(
  participant: { attempts: number; nextEligibleAt: Date | null } | undefined,
  perUserCap: number,
  now: Date,
) {
  return Boolean(
    !participant ||
      (participant.attempts < perUserCap &&
        (!participant.nextEligibleAt || participant.nextEligibleAt <= now)),
  );
}

export function isCheaplySafeModelComparisonMessage(userMessage: string) {
  return (
    !matchesVoiceIntent(userMessage) &&
    !matchesHealthRiskIntent(userMessage) &&
    !matchesMemoryWriteIntent(userMessage) &&
    !matchesMemoryDeleteIntent(userMessage) &&
    !matchesProfileWriteIntent(userMessage) &&
    !matchesPreferenceWriteIntent(userMessage) &&
    !matchesNotesWriteIntent(userMessage) &&
    !shouldEnableWebSearchTool(userMessage) &&
    !shouldEnableWebFetchTool(userMessage)
  );
}

export function isSafeModelComparisonTurn(
  turnPlan: TurnPlan,
  userMessage = "",
) {
  const capabilities = turnPlan.capabilities;
  return (
    turnPlan.inputOrigin === "text" &&
    turnPlan.outputMode === "text" &&
    !capabilities.webSearch &&
    !capabilities.webFetch &&
    !capabilities.memoryWrite &&
    !capabilities.profileWrite &&
    !capabilities.preferenceWrite &&
    !capabilities.notesWrite &&
    !turnPlan.reasonCodes.includes("HEALTH_OR_SAFETY") &&
    !matchesVoiceIntent(userMessage)
  );
}

export async function getEligibleModelExperiment({
  userId,
  clerkId,
  countryCode,
  now = new Date(),
}: {
  userId: string;
  clerkId: string;
  countryCode: string;
  now?: Date;
}) {
  const experiment = await getModelExperimentCandidate({
    userId,
    countryCode,
    now,
  });
  if (!experiment) return null;
  return (await isModelExperimentFlagEnabled(experiment, clerkId))
    ? experiment
    : null;
}

export async function getModelExperimentCandidate({
  userId,
  countryCode,
  now = new Date(),
}: {
  userId: string;
  countryCode: string;
  now?: Date;
}) {
  const experiment = await prisma.modelExperiment.findFirst({
    where: { status: "ACTIVE", targetCountry: countryCode.toUpperCase() },
    include: {
      variants: true,
      participants: { where: { userId }, take: 1 },
    },
  });
  if (!experiment || experiment.variants.length !== 2) return null;

  const roles = new Set(experiment.variants.map((variant) => variant.role));
  if (!roles.has("CONTROL") || !roles.has("CANDIDATE")) return null;

  const participant = experiment.participants[0];
  if (!isParticipantCadenceEligible(participant, experiment.perUserCap, now)) {
    return null;
  }

  return experiment;
}

export async function isModelExperimentFlagEnabled(
  experiment: { id: string; posthogFlagKey: string },
  clerkId: string,
) {
  try {
    const enabled = await getPostHogClient().getFeatureFlag(
      experiment.posthogFlagKey,
      clerkId,
      { sendFeatureFlagEvents: false },
    );
    return enabled === true;
  } catch (error) {
    logger.warn(
      "model_comparison.flag_failed",
      "Model comparison flag evaluation failed closed",
      { error, experimentId: experiment.id },
    );
    return false;
  }
}
