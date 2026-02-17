/**
 * Organization Module — core business logic.
 *
 * This file imports from sibling submodules:
 * - `./clerk-api`  — Clerk SDK wrappers
 * - `./audit-log`  — audit logging helpers
 * - `./helpers`    — pure utility functions
 */

import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import type { OrganizationContractInput } from "@/lib/organizations/types";

import {
  addClerkMembership,
  CLERK_MEMBER_ROLE,
  CLERK_OWNER_ROLE,
  callClerkMethod,
  createClerkOrganization,
  deleteClerkOrganization,
  getString,
  inviteClerkOwner,
  removeClerkMembership,
  updateClerkMembershipRole,
  updateClerkOrganization,
} from "./clerk-api";
import {
  ensureUniqueSlug,
  getRoleFromClerkMembership,
  isSerializationFailure,
  jsonValue,
  resolveOwnerByEmail,
  sanitizeContractInput,
  slugify,
} from "./helpers";

// Re-export for existing consumers of "@/lib/organizations/service".
export { listOrganizationAuditLogs } from "./audit-log";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

class OrganizationServiceError extends Error {
  code:
    | "ORGANIZATION_DB_CREATE_FAILED"
    | "ORGANIZATION_CREATE_CLEANUP_INCOMPLETE"
    | "ORGANIZATION_DB_DELETE_FAILED_AFTER_CLERK";

  constructor(
    code:
      | "ORGANIZATION_DB_CREATE_FAILED"
      | "ORGANIZATION_CREATE_CLEANUP_INCOMPLETE"
      | "ORGANIZATION_DB_DELETE_FAILED_AFTER_CLERK",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "OrganizationServiceError";
    this.code = code;
    if (options && "cause" in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

interface CreateOrganizationInput {
  name: string;
  slug?: string;
  ownerEmail: string;
  contract: OrganizationContractInput;
  createdByUserId: string;
}

interface UpdateOrganizationInput {
  organizationId: string;
  actorUserId: string;
  name?: string;
  slug?: string;
  contract?: Partial<OrganizationContractInput>;
  ownerEmail?: string;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

interface DeleteOrganizationInput {
  organizationId: string;
  actorUserId: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listOrganizations() {
  let organizations: Array<{
    id: string;
    clerkOrganizationId: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    pendingOwnerEmail: string | null;
    ownerUser: { id: string; email: string | null } | null;
    contract: Prisma.OrganizationContractGetPayload<object> | null;
    memberships: Array<{ id: string }>;
    createdAt: Date;
    updatedAt: Date;
  }>;

  try {
    organizations = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        contract: true,
        ownerUser: {
          select: { id: true, email: true },
        },
        memberships: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" ||
        error.code === "P2022" ||
        error.code === "P2010")
    ) {
      // Organizations schema is not fully initialized yet.
      return [];
    }
    throw error;
  }

  return organizations.map((organization) => ({
    id: organization.id,
    clerkOrganizationId: organization.clerkOrganizationId,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    pendingOwnerEmail: organization.pendingOwnerEmail,
    owner: organization.ownerUser,
    contract: organization.contract,
    activeMembers: organization.memberships.length,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  }));
}

export async function getOrganizationById(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      contract: true,
      ownerUser: {
        select: { id: true, email: true },
      },
      createdByUser: {
        select: { id: true, email: true },
      },
      memberships: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, email: true, clerkId: true },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Backfill from Clerk
// ---------------------------------------------------------------------------

export async function backfillOrganizationsFromClerk(
  actorUserId: string,
): Promise<number> {
  const response = await callClerkMethod<{
    data?: Array<{
      id?: string;
      name?: string;
      slug?: string;
    }>;
  }>(["getOrganizationList", "getList"], {
    limit: 200,
  });

  const organizations = Array.isArray(response?.data) ? response.data : [];
  let upserted = 0;

  for (const organization of organizations) {
    const clerkOrganizationId = getString(organization.id);
    const name = getString(organization.name);
    if (!clerkOrganizationId || !name) {
      continue;
    }

    const clerkSlug = getString(organization.slug);
    const desiredSlug =
      clerkSlug || slugify(name) || `org-${clerkOrganizationId.slice(-8)}`;

    const existing = await prisma.organization.findUnique({
      where: { clerkOrganizationId },
      select: { id: true, slug: true },
    });

    if (existing) {
      await prisma.organization.update({
        where: { id: existing.id },
        data: {
          name,
          slug: clerkSlug ?? existing.slug,
          status: "ACTIVE",
        },
      });
      upserted += 1;
      continue;
    }

    const uniqueSlug = await ensureUniqueSlug(desiredSlug);

    await prisma.organization.create({
      data: {
        clerkOrganizationId,
        name,
        slug: uniqueSlug,
        status: "ACTIVE",
        createdByUserId: actorUserId,
      },
    });

    upserted += 1;
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOrganizationWithContract(
  input: CreateOrganizationInput,
) {
  const normalizedSlug = await ensureUniqueSlug(
    slugify(input.slug || input.name),
  );
  const normalizedContract = sanitizeContractInput(input.contract);

  const clerkOrganization = await createClerkOrganization({
    name: input.name,
    slug: normalizedSlug,
  });

  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  let createdMembershipId: string | null = null;
  let createdMembershipUserClerkId: string | null = null;

  try {
    const ownerUser = await resolveOwnerByEmail(ownerEmail);

    if (ownerUser?.clerkId) {
      const membership = await addClerkMembership({
        clerkOrganizationId: clerkOrganization.id,
        clerkUserId: ownerUser.clerkId,
        role: CLERK_OWNER_ROLE,
      });
      createdMembershipId = membership.id;
      createdMembershipUserClerkId = ownerUser.clerkId;
    } else {
      await inviteClerkOwner({
        clerkOrganizationId: clerkOrganization.id,
        ownerEmail,
      });
    }

    return await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          clerkOrganizationId: clerkOrganization.id,
          name: input.name,
          slug: normalizedSlug,
          createdByUserId: input.createdByUserId,
          ownerUserId: ownerUser?.id ?? null,
          pendingOwnerEmail: ownerUser?.id ? null : ownerEmail,
          contract: {
            create: normalizedContract,
          },
        },
        include: {
          contract: true,
          ownerUser: {
            select: { id: true, email: true },
          },
        },
      });

      if (ownerUser?.id && createdMembershipId) {
        await tx.organizationMembership.upsert({
          where: {
            organizationId_userId: {
              organizationId: created.id,
              userId: ownerUser.id,
            },
          },
          update: {
            clerkMembershipId: createdMembershipId,
            role: "OWNER",
            status: "ACTIVE",
            joinedAt: new Date(),
            leftAt: null,
          },
          create: {
            organizationId: created.id,
            userId: ownerUser.id,
            clerkMembershipId: createdMembershipId,
            role: "OWNER",
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });
      }

      await tx.organizationAuditLog.create({
        data: {
          organizationId: created.id,
          actorUserId: input.createdByUserId,
          actorType: "ADMIN",
          action: "ORGANIZATION_CREATED",
          after: jsonValue({
            name: created.name,
            slug: created.slug,
            ownerEmail,
            hasDirectOwner: Boolean(ownerUser?.id),
            contract: normalizedContract,
          }),
        },
      });

      if (ownerUser?.id) {
        await tx.organizationAuditLog.create({
          data: {
            organizationId: created.id,
            actorUserId: input.createdByUserId,
            actorType: "ADMIN",
            action: "OWNER_ASSIGNED",
            after: jsonValue({
              ownerUserId: ownerUser.id,
              ownerEmail: ownerUser.email,
            }),
          },
        });
      }

      return created;
    });
  } catch (error) {
    let cleanupFailed = false;

    if (createdMembershipId && createdMembershipUserClerkId) {
      await removeClerkMembership({
        clerkOrganizationId: clerkOrganization.id,
        clerkUserId: createdMembershipUserClerkId,
        clerkMembershipId: createdMembershipId,
      }).catch((cleanupError) => {
        cleanupFailed = true;
        console.error(
          "[Organizations] Failed cleaning owner membership after create failure:",
          cleanupError,
        );
      });
    }

    await deleteClerkOrganization({
      clerkOrganizationId: clerkOrganization.id,
    }).catch((cleanupError) => {
      cleanupFailed = true;
      console.error(
        "[Organizations] Failed deleting Clerk organization after create failure:",
        cleanupError,
      );
    });

    console.error(
      "[Organizations] Create flow failed after Clerk provisioning",
      {
        clerkOrganizationId: clerkOrganization.id,
        ownerEmail,
        slug: normalizedSlug,
        cleanupFailed,
        error,
      },
    );

    if (cleanupFailed) {
      throw new OrganizationServiceError(
        "ORGANIZATION_CREATE_CLEANUP_INCOMPLETE",
        "Organization create failed and cleanup was incomplete",
        { cause: error },
      );
    }

    throw new OrganizationServiceError(
      "ORGANIZATION_DB_CREATE_FAILED",
      "Organization create failed after Clerk provisioning",
      { cause: error },
    );
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateOrganization(input: UpdateOrganizationInput) {
  const existing = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    include: {
      contract: true,
      memberships: {
        where: { status: "ACTIVE", role: "OWNER" },
        select: {
          id: true,
          userId: true,
          clerkMembershipId: true,
          user: {
            select: {
              clerkId: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Organization not found");
  }

  const updates: Prisma.OrganizationUpdateInput = {};
  if (typeof input.name === "string") {
    const nextName = input.name.trim();
    if (!nextName) {
      throw new Error("name is required");
    }
    if (nextName !== existing.name) {
      updates.name = nextName;
    }
  }

  if (typeof input.slug === "string") {
    const normalizedSlug = slugify(input.slug);
    if (!normalizedSlug) {
      throw new Error("slug is required");
    }
    const nextSlug = await ensureUniqueSlug(normalizedSlug, {
      excludeOrganizationId: existing.id,
    });
    if (nextSlug !== existing.slug) {
      updates.slug = nextSlug;
    }
  }

  if (input.status) {
    updates.status = input.status;
  }

  const contractPatch = input.contract
    ? sanitizeContractInput(
        existing.contract
          ? {
              ...existing.contract,
              ...input.contract,
            }
          : (input.contract as OrganizationContractInput),
      )
    : null;

  const before = {
    name: existing.name,
    slug: existing.slug,
    status: existing.status,
    ownerUserId: existing.ownerUserId,
    pendingOwnerEmail: existing.pendingOwnerEmail,
    contract: existing.contract,
  };

  let ownerTransfer: {
    newOwnerUserId: string;
    newOwnerClerkId: string;
    oldOwnerMembershipId: string | null;
    oldOwnerClerkId: string | null;
  } | null = null;
  let ownerChanged = false;

  if (input.ownerEmail) {
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    const ownerUser = await resolveOwnerByEmail(ownerEmail);
    if (ownerUser?.id && ownerUser.clerkId) {
      updates.ownerUser = { connect: { id: ownerUser.id } };
      updates.pendingOwnerEmail = null;
      ownerChanged =
        existing.ownerUserId !== ownerUser.id ||
        existing.pendingOwnerEmail !== null;

      if (existing.ownerUserId !== ownerUser.id) {
        ownerTransfer = {
          newOwnerUserId: ownerUser.id,
          newOwnerClerkId: ownerUser.clerkId,
          oldOwnerMembershipId:
            existing.memberships[0]?.clerkMembershipId ?? null,
          oldOwnerClerkId: existing.memberships[0]?.user.clerkId ?? null,
        };
      }
    } else {
      updates.ownerUser = { disconnect: true };
      updates.pendingOwnerEmail = ownerEmail;
      ownerChanged =
        existing.ownerUserId !== null ||
        existing.pendingOwnerEmail !== ownerEmail;

      if (ownerChanged) {
        await inviteClerkOwner({
          clerkOrganizationId: existing.clerkOrganizationId,
          ownerEmail,
        });
      }
    }
  }

  let newOwnerClerkMembershipId: string | null = null;
  if (ownerTransfer) {
    const newMembership = await addClerkMembership({
      clerkOrganizationId: existing.clerkOrganizationId,
      clerkUserId: ownerTransfer.newOwnerClerkId,
      role: CLERK_OWNER_ROLE,
    });

    if (!newMembership.id) {
      throw new Error("Failed to create Clerk owner membership");
    }
    newOwnerClerkMembershipId = newMembership.id;
  }

  const clerkOrganizationPatch: { name?: string; slug?: string } = {};
  if (typeof updates.name === "string") {
    clerkOrganizationPatch.name = updates.name;
  }
  if (typeof updates.slug === "string") {
    clerkOrganizationPatch.slug = updates.slug;
  }
  const hasClerkOrganizationPatch =
    Boolean(clerkOrganizationPatch.name) ||
    Boolean(clerkOrganizationPatch.slug);
  let clerkOrganizationPatched = false;
  if (hasClerkOrganizationPatch) {
    await updateClerkOrganization({
      clerkOrganizationId: existing.clerkOrganizationId,
      ...clerkOrganizationPatch,
    });
    clerkOrganizationPatched = true;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (contractPatch) {
        if (existing.contract) {
          await tx.organizationContract.update({
            where: { organizationId: existing.id },
            data: {
              ...contractPatch,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.organizationContract.create({
            data: {
              organizationId: existing.id,
              ...contractPatch,
            },
          });
        }
      }

      const organization = await tx.organization.update({
        where: { id: existing.id },
        data: updates,
        include: {
          contract: true,
          ownerUser: { select: { id: true, email: true } },
        },
      });

      if (ownerTransfer && newOwnerClerkMembershipId) {
        await tx.organizationMembership.updateMany({
          where: {
            organizationId: existing.id,
            status: "ACTIVE",
            role: "OWNER",
            userId: { not: ownerTransfer.newOwnerUserId },
          },
          data: {
            role: "MEMBER",
          },
        });

        await tx.organizationMembership.upsert({
          where: {
            organizationId_userId: {
              organizationId: existing.id,
              userId: ownerTransfer.newOwnerUserId,
            },
          },
          update: {
            role: "OWNER",
            status: "ACTIVE",
            clerkMembershipId: newOwnerClerkMembershipId,
            joinedAt: new Date(),
            leftAt: null,
          },
          create: {
            organizationId: existing.id,
            userId: ownerTransfer.newOwnerUserId,
            role: "OWNER",
            status: "ACTIVE",
            clerkMembershipId: newOwnerClerkMembershipId,
            joinedAt: new Date(),
          },
        });
      }

      if (contractPatch) {
        await tx.organizationAuditLog.create({
          data: {
            organizationId: existing.id,
            actorUserId: input.actorUserId,
            actorType: "ADMIN",
            action: "CONTRACT_UPDATED",
            before: jsonValue({
              contract: before.contract,
            }),
            after: jsonValue({
              contract: organization.contract,
            }),
          },
        });
      }

      if (ownerChanged) {
        await tx.organizationAuditLog.create({
          data: {
            organizationId: existing.id,
            actorUserId: input.actorUserId,
            actorType: "ADMIN",
            action: before.ownerUserId ? "OWNER_TRANSFERRED" : "OWNER_ASSIGNED",
            before: jsonValue({
              ownerUserId: before.ownerUserId,
              pendingOwnerEmail: before.pendingOwnerEmail,
            }),
            after: jsonValue({
              ownerUserId: organization.ownerUserId,
              pendingOwnerEmail: organization.pendingOwnerEmail,
            }),
          },
        });
      }

      return organization;
    });

    if (ownerTransfer?.oldOwnerMembershipId && ownerTransfer.oldOwnerClerkId) {
      await updateClerkMembershipRole({
        clerkOrganizationId: existing.clerkOrganizationId,
        clerkUserId: ownerTransfer.oldOwnerClerkId,
        clerkMembershipId: ownerTransfer.oldOwnerMembershipId,
        role: CLERK_MEMBER_ROLE,
      }).catch((error) => {
        console.error(
          "[Organizations] Failed to demote previous owner:",
          error,
        );
      });
    }

    return updated;
  } catch (error) {
    if (clerkOrganizationPatched) {
      await updateClerkOrganization({
        clerkOrganizationId: existing.clerkOrganizationId,
        name: before.name,
        slug: before.slug,
      }).catch((cleanupError) => {
        console.error(
          "[Organizations] Failed to revert Clerk organization profile after DB failure:",
          cleanupError,
        );
      });
    }

    // Best-effort compensation: if DB update fails after Clerk owner membership was created,
    // remove the Clerk membership to keep systems aligned.
    if (newOwnerClerkMembershipId && ownerTransfer) {
      await removeClerkMembership({
        clerkOrganizationId: existing.clerkOrganizationId,
        clerkUserId: ownerTransfer.newOwnerClerkId,
        clerkMembershipId: newOwnerClerkMembershipId,
      }).catch((cleanupError) => {
        console.error(
          "[Organizations] Failed to compensate Clerk owner membership after DB failure:",
          cleanupError,
        );
      });
    }
    throw error;
  }
}

export async function deleteOrganization(input: DeleteOrganizationInput) {
  const existing = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      clerkOrganizationId: true,
    },
  });

  if (!existing) {
    throw new Error("Organization not found");
  }

  await deleteClerkOrganization({
    clerkOrganizationId: existing.clerkOrganizationId,
  });

  try {
    await prisma.organization.delete({
      where: { id: existing.id },
    });
  } catch (error) {
    console.error(
      "[Organizations] Clerk organization deleted but failed to delete local record",
      {
        organizationId: existing.id,
        clerkOrganizationId: existing.clerkOrganizationId,
        actorUserId: input.actorUserId,
        error,
      },
    );

    throw new OrganizationServiceError(
      "ORGANIZATION_DB_DELETE_FAILED_AFTER_CLERK",
      "Organization was deleted in Clerk but local cleanup failed",
      { cause: error },
    );
  }

  return {
    id: existing.id,
    name: existing.name,
  };
}

// ---------------------------------------------------------------------------
// Webhook sync helpers
// ---------------------------------------------------------------------------

async function resolveMembershipUserByClerkId(clerkUserId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
    select: { id: true, clerkId: true },
  });

  if (existing) {
    return existing;
  }

  let email: string | null = null;

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
  } catch (error) {
    console.error(
      "[Organizations] Failed fetching Clerk user for membership sync:",
      error,
    );
  }

  if (email) {
    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true, clerkId: true },
    });

    if (emailOwner) {
      if (!emailOwner.clerkId) {
        return prisma.user.update({
          where: { id: emailOwner.id },
          data: { clerkId: clerkUserId },
          select: { id: true, clerkId: true },
        });
      }
      return emailOwner;
    }
  }

  return prisma.user.upsert({
    where: { clerkId: clerkUserId },
    update: email ? { email } : {},
    create: email ? { clerkId: clerkUserId, email } : { clerkId: clerkUserId },
    select: { id: true, clerkId: true },
  });
}

export async function syncOrganizationFromClerkEvent(input: {
  clerkOrganizationId: string;
  name?: string | null;
  slug?: string | null;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}) {
  const existing = await prisma.organization.findUnique({
    where: { clerkOrganizationId: input.clerkOrganizationId },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  return prisma.organization.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function syncMembershipFromClerkEvent(input: {
  clerkOrganizationId: string;
  clerkMembershipId: string;
  clerkUserId: string;
  role?: string | null;
  status: "ACTIVE" | "REMOVED" | "BLOCKED";
}) {
  const [organization, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { clerkOrganizationId: input.clerkOrganizationId },
      include: { contract: true },
    }),
    resolveMembershipUserByClerkId(input.clerkUserId),
  ]);

  if (!organization || !organization.contract) {
    return { synced: false, reason: "organization_not_found" as const };
  }
  const seatLimit = organization.contract.seatLimit;

  const memberRole = getRoleFromClerkMembership(getString(input.role));
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const membership = await tx.organizationMembership.upsert({
            where: { clerkMembershipId: input.clerkMembershipId },
            update: {
              organizationId: organization.id,
              userId: user.id,
              role: memberRole,
              status: input.status,
              joinedAt: input.status === "ACTIVE" ? now : undefined,
              leftAt: input.status === "ACTIVE" ? null : now,
            },
            create: {
              organizationId: organization.id,
              userId: user.id,
              clerkMembershipId: input.clerkMembershipId,
              role: memberRole,
              status: input.status,
              joinedAt: input.status === "ACTIVE" ? now : null,
              leftAt: input.status === "ACTIVE" ? null : now,
            },
          });

          await tx.organizationAuditLog.create({
            data: {
              organizationId: organization.id,
              actorType: "WEBHOOK",
              action: "MEMBERSHIP_SYNCED",
              metadata: jsonValue({
                clerkMembershipId: input.clerkMembershipId,
                clerkUserId: input.clerkUserId,
                status: input.status,
                role: memberRole,
              }),
            },
          });

          if (input.status === "ACTIVE") {
            const activeMembers = await tx.organizationMembership.count({
              where: {
                organizationId: organization.id,
                status: "ACTIVE",
              },
            });

            if (activeMembers > seatLimit) {
              await tx.organizationMembership.update({
                where: { id: membership.id },
                data: {
                  status: "BLOCKED",
                  leftAt: new Date(),
                },
              });

              await tx.organizationAuditLog.create({
                data: {
                  organizationId: organization.id,
                  actorType: "WEBHOOK",
                  action: "MEMBERSHIP_BLOCKED_SEAT_LIMIT",
                  metadata: jsonValue({
                    clerkMembershipId: input.clerkMembershipId,
                    seatLimit,
                    activeMembers,
                  }),
                },
              });

              return { seatBlocked: true as const };
            }

            if (memberRole === "OWNER") {
              const previousOwner = await tx.organization.findUnique({
                where: { id: organization.id },
                select: { ownerUserId: true },
              });

              await tx.organizationMembership.updateMany({
                where: {
                  organizationId: organization.id,
                  status: "ACTIVE",
                  role: "OWNER",
                  userId: { not: user.id },
                },
                data: { role: "MEMBER" },
              });

              await tx.organizationMembership.update({
                where: { id: membership.id },
                data: { role: "OWNER" },
              });

              await tx.organization.update({
                where: { id: organization.id },
                data: {
                  ownerUserId: user.id,
                  pendingOwnerEmail: null,
                },
              });

              await tx.organizationAuditLog.create({
                data: {
                  organizationId: organization.id,
                  actorType: "WEBHOOK",
                  action: previousOwner?.ownerUserId
                    ? "OWNER_TRANSFERRED"
                    : "OWNER_ASSIGNED",
                  before: jsonValue({
                    ownerUserId: previousOwner?.ownerUserId ?? null,
                  }),
                  after: jsonValue({
                    ownerUserId: user.id,
                  }),
                  metadata: jsonValue({
                    clerkMembershipId: input.clerkMembershipId,
                  }),
                },
              });
            }
          }

          return { seatBlocked: false as const };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      if (result.seatBlocked) {
        try {
          await removeClerkMembership({
            clerkOrganizationId: input.clerkOrganizationId,
            clerkUserId: input.clerkUserId,
            clerkMembershipId: input.clerkMembershipId,
          });
        } catch (error) {
          console.error(
            "[Organizations] Failed removing over-seat membership:",
            error,
          );
          throw new Error(
            "Seat limit block applied locally but failed to remove membership in Clerk",
          );
        }

        return { synced: false, reason: "seat_limit_blocked" as const };
      }

      return { synced: true, reason: "ok" as const };
    } catch (error) {
      if (isSerializationFailure(error) && attempt < maxRetries) {
        continue;
      }
      throw error;
    }
  }

  return { synced: false, reason: "serialization_retries_exhausted" as const };
}
