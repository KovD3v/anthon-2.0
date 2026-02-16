import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  applyOrgOverrides,
  isOrganizationBasePlan,
} from "@/lib/organizations/plan-defaults";
import {
  deleteOrganization,
  getOrganizationById,
  updateOrganization,
} from "@/lib/organizations/service";
import type { OrganizationContractInput } from "@/lib/organizations/types";

const PATCHABLE_CONTRACT_FIELDS = new Set<keyof OrganizationContractInput>([
  "basePlan",
  "seatLimit",
  "planLabel",
  "modelTier",
  "maxRequestsPerDay",
  "maxInputTokensPerDay",
  "maxOutputTokensPerDay",
  "maxCostPerDay",
  "maxContextMessages",
]);

function isValidStatus(
  value: unknown,
): value is "ACTIVE" | "SUSPENDED" | "ARCHIVED" {
  return value === "ACTIVE" || value === "SUSPENDED" || value === "ARCHIVED";
}

function validateContractPatch(
  value: unknown,
):
  | { valid: true; data: Partial<OrganizationContractInput> }
  | { valid: false; error: string } {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "contract must be an object" };
  }

  const candidate = value as Record<string, unknown>;
  const patch: Partial<OrganizationContractInput> = {};

  for (const [key, raw] of Object.entries(candidate)) {
    if (
      !PATCHABLE_CONTRACT_FIELDS.has(key as keyof OrganizationContractInput)
    ) {
      return { valid: false, error: `Unknown contract field: ${key}` };
    }

    if (key === "basePlan" && !isOrganizationBasePlan(raw)) {
      return {
        valid: false,
        error: "basePlan must be BASIC, BASIC_PLUS, or PRO",
      };
    }

    if (
      key === "seatLimit" ||
      key === "maxRequestsPerDay" ||
      key === "maxInputTokensPerDay" ||
      key === "maxOutputTokensPerDay" ||
      key === "maxContextMessages"
    ) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 1) {
        return { valid: false, error: `${key} must be a number >= 1` };
      }
      (patch as Record<string, unknown>)[key] = num;
      continue;
    }

    if (key === "maxCostPerDay") {
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        return { valid: false, error: "maxCostPerDay must be a number >= 0" };
      }
      patch.maxCostPerDay = num;
      continue;
    }

    if (key === "planLabel") {
      const label = String(raw || "").trim();
      if (!label) {
        return { valid: false, error: "planLabel cannot be empty" };
      }
      patch.planLabel = label;
      continue;
    }

    (patch as Record<string, unknown>)[key] = raw;
  }

  return { valid: true, data: patch };
}

// GET /api/admin/organizations/[organizationId] - organization detail
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const { organizationId } = await context.params;
    const organization = await getOrganizationById(organizationId);

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const activeMembers = organization.memberships.filter(
      (membership) => membership.status === "ACTIVE",
    ).length;

    const { ownerUser, ...organizationWithoutOwnerUser } = organization;

    return NextResponse.json({
      organization: {
        ...organizationWithoutOwnerUser,
        owner: ownerUser,
        activeMembers,
        effective: organization.contract
          ? applyOrgOverrides(organization.contract).effective
          : null,
      },
    });
  } catch (error) {
    console.error("[Organization Detail API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 },
    );
  }
}

// PATCH /api/admin/organizations/[organizationId] - update organization metadata/contract/owner
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { organizationId } = await context.params;
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      contract?: Record<string, unknown>;
      ownerEmail?: string;
      status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    };
    const contractPatch =
      body.contract && typeof body.contract === "object"
        ? validateContractPatch(body.contract)
        : undefined;

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const slug = typeof body.slug === "string" ? body.slug.trim() : undefined;

    if (typeof body.name === "string" && !name) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 },
      );
    }

    if (typeof body.slug === "string" && !slug) {
      return NextResponse.json(
        { error: "slug cannot be empty" },
        { status: 400 },
      );
    }

    if (!contractPatch && !body.ownerEmail && !body.status && !name && !slug) {
      return NextResponse.json(
        { error: "No updates were provided" },
        { status: 400 },
      );
    }

    if (body.ownerEmail && !body.ownerEmail.includes("@")) {
      return NextResponse.json(
        { error: "ownerEmail must be a valid email" },
        { status: 400 },
      );
    }

    if (body.status && !isValidStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (contractPatch && !contractPatch.valid) {
      return NextResponse.json({ error: contractPatch.error }, { status: 400 });
    }

    const updated = await updateOrganization({
      organizationId,
      actorUserId: user.id,
      name,
      slug,
      contract: contractPatch?.data,
      ownerEmail: body.ownerEmail,
      status: body.status,
    });

    return NextResponse.json({
      organization: {
        ...updated,
        effective: updated.contract
          ? applyOrgOverrides(updated.contract).effective
          : null,
      },
    });
  } catch (error) {
    console.error("[Organization Detail API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/organizations/[organizationId] - delete organization in Clerk + local DB
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { organizationId } = await context.params;
    const deleted = await deleteOrganization({
      organizationId,
      actorUserId: user.id,
    });

    return NextResponse.json({
      deleted: true,
      organizationId: deleted.id,
      name: deleted.name,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Organization not found") {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    console.error("[Organization Detail API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 },
    );
  }
}
