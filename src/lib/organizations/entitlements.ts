import { prisma } from "@/lib/db";
import {
  PERSONAL_PLAN_LIMITS,
  type PersonalPlanKey,
  planKeyToModelTier,
} from "@/lib/limits/personal-limits";
import {
  applyOrgOverrides,
  compareEntitlementVectors,
} from "@/lib/organizations/plan-defaults";
import type {
  EffectiveEntitlementSource,
  EffectiveEntitlements,
  OrganizationModelTier,
} from "@/lib/organizations/types";

interface ResolveEffectiveEntitlementsInput {
  userId: string;
  subscriptionStatus?: string | null;
  userRole?: string | null;
  planId?: string | null;
  isGuest?: boolean;
}

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function resolvePersonalPlanKey(
  subscriptionStatus?: string | null,
  planId?: string | null,
  isGuest?: boolean,
): PersonalPlanKey {
  if (isGuest) {
    return "GUEST";
  }

  if (planId && subscriptionStatus === "ACTIVE") {
    const normalizedPlanId = planId.toLowerCase();
    if (normalizedPlanId.includes("pro")) {
      return "pro";
    }
    if (normalizedPlanId.includes("basic_plus")) {
      return "basic_plus";
    }
    if (normalizedPlanId.includes("basic")) {
      return "basic";
    }
  }

  if (subscriptionStatus === "ACTIVE") {
    return "ACTIVE";
  }

  return "TRIAL";
}

function buildPersonalSource(
  subscriptionStatus?: string | null,
  userRole?: string | null,
  planId?: string | null,
  isGuest?: boolean,
): EffectiveEntitlementSource {
  if (isAdminRole(userRole)) {
    return {
      type: "personal",
      sourceId: "personal-admin",
      sourceLabel: "Admin role",
      limits: PERSONAL_PLAN_LIMITS.ADMIN,
      modelTier: "ADMIN",
    };
  }

  const planKey = resolvePersonalPlanKey(subscriptionStatus, planId, isGuest);
  const tier = planKeyToModelTier(planKey);

  return {
    type: "personal",
    sourceId: "personal-subscription",
    sourceLabel: isGuest ? "Guest" : `Personal ${planKey}`,
    limits: PERSONAL_PLAN_LIMITS[planKey],
    modelTier: tier,
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
  const personal = buildPersonalSource(
    input.subscriptionStatus,
    input.userRole,
    input.planId,
    input.isGuest,
  );

  // Guest and admin users do not need organization-level merging.
  if (input.isGuest || isAdminRole(input.userRole)) {
    return {
      limits: personal.limits,
      modelTier: personal.modelTier,
      sources: [personal],
    };
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
          id: true,
          name: true,
          contract: {
            select: {
              id: true,
              organizationId: true,
              seatLimit: true,
              planLabel: true,
              modelTier: true,
              maxRequestsPerDay: true,
              maxInputTokensPerDay: true,
              maxOutputTokensPerDay: true,
              maxCostPerDay: true,
              maxContextMessages: true,
              version: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (memberships.length === 0) {
    return {
      limits: personal.limits,
      modelTier: personal.modelTier,
      sources: [personal],
    };
  }

  const organizationSources: EffectiveEntitlementSource[] = memberships.flatMap(
    (membership) => {
      const contract = membership.organization.contract;
      if (!contract) {
        return [];
      }

      const { basePlan, effective } = applyOrgOverrides(contract);
      return [
        {
          type: "organization" as const,
          sourceId: membership.organizationId,
          sourceLabel: `organization:${membership.organization.name}:${basePlan}`,
          limits: effective.limits,
          modelTier: effective.modelTier,
        },
      ];
    },
  );

  if (organizationSources.length === 0) {
    const personalFallback: EffectiveEntitlementSource = {
      ...personal,
      sourceId: "personal-fallback",
      sourceLabel: "Personal fallback (missing organization contract)",
    };

    return {
      limits: personalFallback.limits,
      modelTier: personalFallback.modelTier,
      sources: [personalFallback],
    };
  }

  const bestOrganizationSource = organizationSources.slice().sort((a, b) => {
    const vectorDiff = compareEntitlementVectors(
      { modelTier: b.modelTier, limits: b.limits },
      { modelTier: a.modelTier, limits: a.limits },
    );
    if (vectorDiff !== 0) {
      return vectorDiff;
    }
    return a.sourceId.localeCompare(b.sourceId);
  })[0];

  return {
    limits: bestOrganizationSource.limits,
    modelTier: bestOrganizationSource.modelTier,
    sources: [bestOrganizationSource],
  };
}
