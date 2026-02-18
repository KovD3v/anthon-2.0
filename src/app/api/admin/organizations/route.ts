import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/auth";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import {
  applyOrgOverrides,
  isOrganizationBasePlan,
} from "@/lib/organizations/plan-defaults";
import {
  backfillOrganizationsFromClerk,
  createOrganizationWithContract,
  listOrganizations,
} from "@/lib/organizations/service";
import {
  ORGANIZATION_MODEL_TIERS,
  type OrganizationContractInput,
} from "@/lib/organizations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const organizationsLogger = createLogger("organizations");

function getErrorDetails(error: unknown): {
  name?: string;
  message: string;
  code?: string;
} {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

function validateContractInput(
  value: unknown,
):
  | { valid: true; data: OrganizationContractInput }
  | { valid: false; error: string } {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "contract is required" };
  }

  const candidate = value as Record<string, unknown>;
  const seatLimit = Number(candidate.seatLimit);
  const maxRequestsPerDay = Number(candidate.maxRequestsPerDay);
  const maxInputTokensPerDay = Number(candidate.maxInputTokensPerDay);
  const maxOutputTokensPerDay = Number(candidate.maxOutputTokensPerDay);
  const maxCostPerDay = Number(candidate.maxCostPerDay);
  const maxContextMessages = Number(candidate.maxContextMessages);
  const basePlan = candidate.basePlan;
  const planLabel = String(candidate.planLabel || "");
  const modelTier = String(candidate.modelTier || "");

  if (!isOrganizationBasePlan(basePlan)) {
    return { valid: false, error: "Invalid basePlan" };
  }

  if (!ORGANIZATION_MODEL_TIERS.includes(modelTier as never)) {
    return { valid: false, error: "Invalid modelTier" };
  }

  if (!Number.isFinite(seatLimit) || seatLimit < 1) {
    return { valid: false, error: "seatLimit must be >= 1" };
  }

  if (!Number.isFinite(maxRequestsPerDay) || maxRequestsPerDay < 1) {
    return { valid: false, error: "maxRequestsPerDay must be >= 1" };
  }

  if (!Number.isFinite(maxInputTokensPerDay) || maxInputTokensPerDay < 1) {
    return { valid: false, error: "maxInputTokensPerDay must be >= 1" };
  }

  if (!Number.isFinite(maxOutputTokensPerDay) || maxOutputTokensPerDay < 1) {
    return { valid: false, error: "maxOutputTokensPerDay must be >= 1" };
  }

  if (!Number.isFinite(maxCostPerDay) || maxCostPerDay < 0) {
    return { valid: false, error: "maxCostPerDay must be >= 0" };
  }

  if (!Number.isFinite(maxContextMessages) || maxContextMessages < 1) {
    return { valid: false, error: "maxContextMessages must be >= 1" };
  }

  if (!planLabel.trim()) {
    return { valid: false, error: "planLabel is required" };
  }

  return {
    valid: true,
    data: {
      basePlan,
      seatLimit,
      planLabel,
      modelTier: modelTier as OrganizationContractInput["modelTier"],
      maxRequestsPerDay,
      maxInputTokensPerDay,
      maxOutputTokensPerDay,
      maxCostPerDay,
      maxContextMessages,
    },
  };
}

// GET /api/admin/organizations - list organizations with seat usage
export async function GET(req: NextRequest) {
  return withRequestLogContext(
    req,
    { route: "/api/admin/organizations", channel: "WEB" },
    async () => {
      const { user, errorResponse } = await requireAdmin();
      if (errorResponse) return errorResponse;

      try {
        const shouldSyncFromClerk =
          req.nextUrl.searchParams.get("sync") === "1";
        if (user && shouldSyncFromClerk) {
          // Local/dev fallback when webhook sync is not configured:
          // mirror Clerk organizations into local storage on explicit request.
          await backfillOrganizationsFromClerk(user.id);
        }

        const organizations = await listOrganizations();
        return NextResponse.json({
          organizations: organizations.map((organization) => ({
            ...organization,
            effective: organization.contract
              ? applyOrgOverrides(organization.contract).effective
              : null,
          })),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2021" ||
            error.code === "P2022" ||
            error.code === "P2010")
        ) {
          return NextResponse.json({ organizations: [] });
        }

        const details = getErrorDetails(error);
        organizationsLogger.error(
          "organizations.api.list.failed",
          "Organizations API GET failed",
          details,
        );
        return NextResponse.json(
          {
            error: "Failed to fetch organizations",
            details:
              process.env.NODE_ENV === "production"
                ? undefined
                : {
                    ...details,
                  },
          },
          {
            status: 500,
          },
        );
      }
    },
  );
}

// POST /api/admin/organizations - create organization + contract + owner assignment/invite
export async function POST(req: NextRequest) {
  return withRequestLogContext(
    req,
    { route: "/api/admin/organizations", channel: "WEB" },
    async () => {
      const { user, errorResponse } = await requireAdmin();
      if (errorResponse) return errorResponse;
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const body = (await req.json()) as Record<string, unknown>;
        const name = String(body.name || "").trim();
        const ownerEmail = String(body.ownerEmail || "")
          .trim()
          .toLowerCase();
        const slug = body.slug ? String(body.slug) : undefined;
        const contractValidation = validateContractInput(body.contract);

        if (!name) {
          return NextResponse.json(
            { error: "name is required" },
            { status: 400 },
          );
        }

        if (!ownerEmail || !ownerEmail.includes("@")) {
          return NextResponse.json(
            { error: "ownerEmail must be a valid email" },
            { status: 400 },
          );
        }

        if (!contractValidation.valid) {
          return NextResponse.json(
            { error: contractValidation.error },
            { status: 400 },
          );
        }

        const organization = await createOrganizationWithContract({
          name,
          slug,
          ownerEmail,
          contract: contractValidation.data,
          createdByUserId: user.id,
        });

        return NextResponse.json(
          {
            organization: {
              ...organization,
              effective: organization.contract
                ? applyOrgOverrides(organization.contract).effective
                : null,
            },
          },
          { status: 201 },
        );
      } catch (error) {
        organizationsLogger.error(
          "organizations.api.create.failed",
          "Organizations API POST failed",
          { error },
        );
        return NextResponse.json(
          { error: "Failed to create organization" },
          { status: 500 },
        );
      }
    },
  );
}
