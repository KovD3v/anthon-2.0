import { prisma } from "@/lib/db";
import {
  compareEntitlementVectors,
  type OrganizationEntitlementSource as PlanOrganizationEntitlementSource,
  type PlanResolutionInput,
  type ResolvedEntitlements as PlanResolvedEntitlements,
  resolvePersonalPlan,
  resolveEffectiveEntitlements as resolvePlanEffectiveEntitlements,
} from "@/lib/plans";
import { applyOrgOverrides } from "./plan-defaults";
import type {
  EffectiveEntitlementSource,
  EffectiveEntitlements,
  OrganizationModelTier,
} from "./types";

interface ResolveEffectiveEntitlementsInput {
  userId: string;
  subscriptionStatus?: string | null;
  userRole?: string | null;
  planId?: string | null;
  isGuest?: boolean;
}

function toEffectiveEntitlements(
  source: PlanResolvedEntitlements,
  usePersonalFallback = false,
): EffectiveEntitlements {
  const mappedSource: EffectiveEntitlementSource = {
    type: source.sourceType,
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    limits: source.limits,
    modelTier: source.modelTier,
  };

  if (usePersonalFallback && mappedSource.type === "personal") {
    mappedSource.sourceId = "personal-fallback";
    mappedSource.sourceLabel =
      "Personal fallback (missing organization contract)";
  }

  return {
    limits: source.limits,
    modelTier: source.modelTier,
    sources: [mappedSource],
  };
}

export function compareModelTiers(
  a: OrganizationModelTier,
  b: OrganizationModelTier,
): number {
  return compareEntitlementVectors(
    {
      modelTier: a,
      limits: {
        maxRequestsPerDay: 0,
        maxInputTokensPerDay: 0,
        maxOutputTokensPerDay: 0,
        maxCostPerDay: 0,
        maxContextMessages: 0,
      },
    },
    {
      modelTier: b,
      limits: {
        maxRequestsPerDay: 0,
        maxInputTokensPerDay: 0,
        maxOutputTokensPerDay: 0,
        maxCostPerDay: 0,
        maxContextMessages: 0,
      },
    },
  );
}

export async function resolveEffectiveEntitlements(
  input: ResolveEffectiveEntitlementsInput,
): Promise<EffectiveEntitlements> {
  const baseInput: PlanResolutionInput = {
    subscriptionStatus: input.subscriptionStatus,
    userRole: input.userRole,
    planId: input.planId,
    isGuest: input.isGuest,
  };

  const personalPlan = resolvePersonalPlan(baseInput);

  // Guest and admin users do not need organization-level merging.
  if (input.isGuest || personalPlan === "ADMIN") {
    const source = resolvePlanEffectiveEntitlements(baseInput);
    return toEffectiveEntitlements(source);
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      organization: {
        status: "ACTIVE",
      },
    },
    select: {
      organizationId: true,
      organization: {
        select: {
          name: true,
          contract: {
            select: {
              basePlan: true,
              modelTier: true,
              maxRequestsPerDay: true,
              maxInputTokensPerDay: true,
              maxOutputTokensPerDay: true,
              maxCostPerDay: true,
              maxContextMessages: true,
            },
          },
        },
      },
    },
  });

  const organizationSources: PlanOrganizationEntitlementSource[] =
    memberships.flatMap((membership) => {
      const contract = membership.organization.contract;

      if (!contract) {
        return [];
      }

      const { basePlan, effective } = applyOrgOverrides(contract);

      return [
        {
          sourceId: membership.organizationId,
          sourceLabel: `organization:${membership.organization.name}:${basePlan}`,
          plan: basePlan,
          modelTier: effective.modelTier,
          limits: effective.limits,
        },
      ];
    });

  if (organizationSources.length === 0) {
    const source = resolvePlanEffectiveEntitlements(baseInput);
    return toEffectiveEntitlements(source, memberships.length > 0);
  }

  const source = resolvePlanEffectiveEntitlements({
    ...baseInput,
    organizationSources,
  });

  return toEffectiveEntitlements(source);
}
