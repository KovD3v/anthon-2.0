import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  organizationFindMany: vi.fn(),
  organizationFindUnique: vi.fn(),
  organizationCreate: vi.fn(),
  organizationUpdate: vi.fn(),
  organizationDelete: vi.fn(),
  userFindUnique: vi.fn(),
  userUpsert: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  removeClerkMembership: vi.fn(),
  addClerkMembership: vi.fn(),
  callClerkMethod: vi.fn(),
  createClerkOrganization: vi.fn(),
  deleteClerkOrganization: vi.fn(),
  inviteClerkOwner: vi.fn(),
  updateClerkMembershipRole: vi.fn(),
  updateClerkOrganization: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: {
      findMany: mocks.organizationFindMany,
      findUnique: mocks.organizationFindUnique,
      create: mocks.organizationCreate,
      update: mocks.organizationUpdate,
      delete: mocks.organizationDelete,
    },
    user: {
      findUnique: mocks.userFindUnique,
      upsert: mocks.userUpsert,
      update: mocks.userUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./clerk-api", () => ({
  CLERK_MEMBER_ROLE: "org:member",
  CLERK_OWNER_ROLE: "org:admin",
  addClerkMembership: mocks.addClerkMembership,
  callClerkMethod: mocks.callClerkMethod,
  createClerkOrganization: mocks.createClerkOrganization,
  deleteClerkOrganization: mocks.deleteClerkOrganization,
  inviteClerkOwner: mocks.inviteClerkOwner,
  removeClerkMembership: mocks.removeClerkMembership,
  updateClerkMembershipRole: mocks.updateClerkMembershipRole,
  updateClerkOrganization: mocks.updateClerkOrganization,
  getString: (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : null,
}));

import {
  backfillOrganizationsFromClerk,
  createOrganizationWithContract,
  deleteOrganization,
  getOrganizationById,
  listOrganizations,
  syncMembershipFromClerkEvent,
  syncOrganizationFromClerkEvent,
  updateOrganization,
} from "./service";

describe("organizations service sync helpers", () => {
  beforeEach(() => {
    mocks.clerkClient.mockReset();
    mocks.organizationFindMany.mockReset();
    mocks.organizationFindUnique.mockReset();
    mocks.organizationCreate.mockReset();
    mocks.organizationUpdate.mockReset();
    mocks.organizationDelete.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.userUpsert.mockReset();
    mocks.userUpdate.mockReset();
    mocks.transaction.mockReset();
    mocks.removeClerkMembership.mockReset();
    mocks.addClerkMembership.mockReset();
    mocks.callClerkMethod.mockReset();
    mocks.createClerkOrganization.mockReset();
    mocks.deleteClerkOrganization.mockReset();
    mocks.inviteClerkOwner.mockReset();
    mocks.updateClerkMembershipRole.mockReset();
    mocks.updateClerkOrganization.mockReset();

    mocks.userFindUnique.mockResolvedValue({ id: "user-1", clerkId: "clerk-user-1" });
    mocks.removeClerkMembership.mockResolvedValue(undefined);
  });

  it("syncOrganizationFromClerkEvent returns null when organization is missing", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null);

    const result = await syncOrganizationFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      name: "New Name",
    });

    expect(result).toBeNull();
    expect(mocks.organizationUpdate).not.toHaveBeenCalled();
  });

  it("syncOrganizationFromClerkEvent updates provided fields", async () => {
    mocks.organizationFindUnique.mockResolvedValue({ id: "org-1" });
    mocks.organizationUpdate.mockResolvedValue({ id: "org-1", name: "Updated Org" });

    const result = await syncOrganizationFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      name: "Updated Org",
      slug: "updated-org",
      status: "SUSPENDED",
    });

    expect(mocks.organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        name: "Updated Org",
        slug: "updated-org",
        status: "SUSPENDED",
      },
    });
    expect(result).toEqual({ id: "org-1", name: "Updated Org" });
  });

  it("syncMembershipFromClerkEvent returns organization_not_found when org is absent", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null);

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_1",
      clerkUserId: "clerk-user-1",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: false, reason: "organization_not_found" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("syncMembershipFromClerkEvent blocks and removes member when seat limit is exceeded", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 1 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_1",
      clerkUserId: "clerk-user-1",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: false, reason: "seat_limit_blocked" });
    expect(tx.organizationMembership.update).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: {
        status: "BLOCKED",
        leftAt: expect.any(Date),
      },
    });
    expect(mocks.removeClerkMembership).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk_1",
      clerkUserId: "clerk-user-1",
      clerkMembershipId: "mem_1",
    });
  });

  it("syncMembershipFromClerkEvent promotes owner and syncs owner pointer", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: "old-owner" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_owner",
      clerkUserId: "clerk-user-1",
      role: "org:admin",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(tx.organizationMembership.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        status: "ACTIVE",
        role: "OWNER",
        userId: { not: "user-1" },
      },
      data: { role: "MEMBER" },
    });
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        ownerUserId: "user-1",
        pendingOwnerEmail: null,
      },
    });
    expect(mocks.removeClerkMembership).not.toHaveBeenCalled();
  });

  it("syncMembershipFromClerkEvent retries on serialization conflicts", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementation(async (fn: (client: unknown) => unknown) =>
        await fn(tx),
      );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_retry",
      clerkUserId: "clerk-user-1",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("syncOrganizationFromClerkEvent updates with empty patch payload when fields are omitted", async () => {
    mocks.organizationFindUnique.mockResolvedValue({ id: "org-1" });
    mocks.organizationUpdate.mockResolvedValue({ id: "org-1" });

    const result = await syncOrganizationFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
    });

    expect(result).toEqual({ id: "org-1" });
    expect(mocks.organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {},
    });
  });

  it("syncMembershipFromClerkEvent resolves user by email and updates missing clerkId", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });
    mocks.userFindUnique
      .mockResolvedValueOnce(null) // lookup by clerkId
      .mockResolvedValueOnce({ id: "user-email", clerkId: null }); // lookup by email
    mocks.userUpdate.mockResolvedValue({ id: "user-email", clerkId: "clerk-user-2" });

    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@org.test" },
      emailAddresses: [],
    });
    mocks.clerkClient.mockResolvedValue({
      users: { getUser },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_2",
      clerkUserId: "clerk-user-2",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-email" },
      data: { clerkId: "clerk-user-2" },
      select: { id: true, clerkId: true },
    });
  });

  it("syncMembershipFromClerkEvent reuses email owner when clerkId is already set", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });
    mocks.userFindUnique
      .mockResolvedValueOnce(null) // lookup by clerkId
      .mockResolvedValueOnce({ id: "user-email", clerkId: "clerk-user-4" }); // lookup by email

    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@org.test" },
      emailAddresses: [],
    });
    mocks.clerkClient.mockResolvedValue({
      users: { getUser },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_4",
      clerkUserId: "clerk-user-4",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpsert).not.toHaveBeenCalled();
  });

  it("syncMembershipFromClerkEvent falls back to upsert user when clerk lookup fails", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userUpsert.mockResolvedValue({ id: "user-upsert", clerkId: "clerk-user-3" });

    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockRejectedValue(new Error("clerk unavailable")),
      },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-1" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_3",
      clerkUserId: "clerk-user-3",
      role: "org:member",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(mocks.userUpsert).toHaveBeenCalledWith({
      where: { clerkId: "clerk-user-3" },
      update: {},
      create: { clerkId: "clerk-user-3" },
      select: { id: true, clerkId: true },
    });
  });

  it("syncMembershipFromClerkEvent handles REMOVED status and keeps owner flow untouched", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-removed" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_removed",
      clerkUserId: "clerk-user-1",
      role: "org:member",
      status: "REMOVED",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    expect(tx.organizationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "REMOVED",
          joinedAt: undefined,
          leftAt: expect.any(Date),
        }),
        create: expect.objectContaining({
          status: "REMOVED",
          joinedAt: null,
          leftAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.organizationMembership.count).not.toHaveBeenCalled();
  });

  it("syncMembershipFromClerkEvent records OWNER_ASSIGNED when no previous owner exists", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 5 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-owner" }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await syncMembershipFromClerkEvent({
      clerkOrganizationId: "org_clerk_1",
      clerkMembershipId: "mem_owner_new",
      clerkUserId: "clerk-user-1",
      role: "org:admin",
      status: "ACTIVE",
    });

    expect(result).toEqual({ synced: true, reason: "ok" });
    const ownerAuditCall = tx.organizationAuditLog.create.mock.calls.find(
      ([arg]: Array<{ data?: { action?: string } }>) =>
        arg?.data?.action === "OWNER_ASSIGNED",
    );
    expect(ownerAuditCall).toBeDefined();
  });

  it("syncMembershipFromClerkEvent throws when seat-limit cleanup in Clerk fails", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org-1",
      contract: { seatLimit: 1 },
    });

    const tx = {
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership-over" }),
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ ownerUserId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );
    mocks.removeClerkMembership.mockRejectedValue(new Error("clerk remove failed"));

    await expect(
      syncMembershipFromClerkEvent({
        clerkOrganizationId: "org_clerk_1",
        clerkMembershipId: "mem_over",
        clerkUserId: "clerk-user-1",
        role: "org:member",
        status: "ACTIVE",
      }),
    ).rejects.toThrow(
      "Seat limit block applied locally but failed to remove membership in Clerk",
    );
  });
});

describe("organizations service core flows", () => {
  beforeEach(() => {
    mocks.organizationFindMany.mockReset();
    mocks.organizationFindUnique.mockReset();
    mocks.organizationCreate.mockReset();
    mocks.organizationUpdate.mockReset();
    mocks.organizationDelete.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.transaction.mockReset();
    mocks.callClerkMethod.mockReset();
    mocks.createClerkOrganization.mockReset();
    mocks.addClerkMembership.mockReset();
    mocks.inviteClerkOwner.mockReset();
    mocks.removeClerkMembership.mockReset();
    mocks.updateClerkOrganization.mockReset();
    mocks.deleteClerkOrganization.mockReset();
  });

  it("listOrganizations maps DB models to API shape", async () => {
    const createdAt = new Date("2026-02-01T00:00:00.000Z");
    const updatedAt = new Date("2026-02-02T00:00:00.000Z");

    mocks.organizationFindMany.mockResolvedValue([
      {
        id: "org_1",
        clerkOrganizationId: "clerk_org_1",
        name: "Org One",
        slug: "org-one",
        status: "ACTIVE",
        pendingOwnerEmail: null,
        ownerUser: { id: "user_1", email: "owner@org.test" },
        contract: { id: "contract_1" },
        memberships: [{ id: "m1" }, { id: "m2" }],
        createdAt,
        updatedAt,
      },
    ]);

    const result = await listOrganizations();

    expect(result).toEqual([
      {
        id: "org_1",
        clerkOrganizationId: "clerk_org_1",
        name: "Org One",
        slug: "org-one",
        status: "ACTIVE",
        pendingOwnerEmail: null,
        owner: { id: "user_1", email: "owner@org.test" },
        contract: { id: "contract_1" },
        activeMembers: 2,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it("listOrganizations returns [] for missing-schema Prisma errors", async () => {
    mocks.organizationFindMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("table missing", {
        code: "P2021",
        clientVersion: "test",
      }),
    );

    await expect(listOrganizations()).resolves.toEqual([]);
  });

  it("listOrganizations returns [] for P2022 and P2010 schema errors", async () => {
    mocks.organizationFindMany
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("column missing", {
          code: "P2022",
          clientVersion: "test",
        }),
      )
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("sql error", {
          code: "P2010",
          clientVersion: "test",
        }),
      );

    await expect(listOrganizations()).resolves.toEqual([]);
    await expect(listOrganizations()).resolves.toEqual([]);
  });

  it("getOrganizationById passes through query result", async () => {
    mocks.organizationFindUnique.mockResolvedValue({ id: "org_1" });

    const result = await getOrganizationById("org_1");

    expect(result).toEqual({ id: "org_1" });
    expect(mocks.organizationFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org_1" },
      }),
    );
  });

  it("backfillOrganizationsFromClerk updates existing and creates new records", async () => {
    mocks.callClerkMethod.mockResolvedValue({
      data: [
        { id: "org_existing", name: "Existing Org", slug: "existing-slug" },
        { id: "org_new", name: "New Org" },
        { id: null, name: "Skip me" },
      ],
    });

    mocks.organizationFindUnique.mockImplementation(
      async (args: { where?: { clerkOrganizationId?: string; slug?: string } }) => {
        if (args.where?.clerkOrganizationId === "org_existing") {
          return { id: "db_org_1", slug: "old-slug" };
        }
        if (args.where?.clerkOrganizationId === "org_new") {
          return null;
        }
        if (args.where?.slug === "new-org") {
          return null;
        }
        return null;
      },
    );

    mocks.organizationUpdate.mockResolvedValue({ id: "db_org_1" });
    mocks.organizationCreate.mockResolvedValue({ id: "db_org_2" });

    const upserted = await backfillOrganizationsFromClerk("admin_1");

    expect(upserted).toBe(2);
    expect(mocks.organizationUpdate).toHaveBeenCalledWith({
      where: { id: "db_org_1" },
      data: {
        name: "Existing Org",
        slug: "existing-slug",
        status: "ACTIVE",
      },
    });
    expect(mocks.organizationCreate).toHaveBeenCalledWith({
      data: {
        clerkOrganizationId: "org_new",
        name: "New Org",
        slug: "new-org",
        status: "ACTIVE",
        createdByUserId: "admin_1",
      },
    });
  });

  it("backfillOrganizationsFromClerk falls back to generated slug and existing slug updates", async () => {
    mocks.callClerkMethod.mockResolvedValue({
      data: [
        { id: "org_existing", name: "Existing Org" },
        { id: "org_new", name: "###" },
      ],
    });

    mocks.organizationFindUnique.mockImplementation(
      async (args: { where?: { clerkOrganizationId?: string; slug?: string } }) => {
        if (args.where?.clerkOrganizationId === "org_existing") {
          return { id: "db_existing", slug: "fallback-existing" };
        }
        if (args.where?.clerkOrganizationId === "org_new") {
          return null;
        }
        if (args.where?.slug === "org-org_new") {
          return null;
        }
        return null;
      },
    );

    mocks.organizationUpdate.mockResolvedValue({ id: "db_existing" });
    mocks.organizationCreate.mockResolvedValue({ id: "db_new" });

    const upserted = await backfillOrganizationsFromClerk("admin_1");

    expect(upserted).toBe(2);
    expect(mocks.organizationUpdate).toHaveBeenCalledWith({
      where: { id: "db_existing" },
      data: {
        name: "Existing Org",
        slug: "fallback-existing",
        status: "ACTIVE",
      },
    });
    expect(mocks.organizationCreate).toHaveBeenCalledWith({
      data: {
        clerkOrganizationId: "org_new",
        name: "###",
        slug: "org-org_new",
        status: "ACTIVE",
        createdByUserId: "admin_1",
      },
    });
  });

  it("deleteOrganization throws when organization is missing", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null);

    await expect(
      deleteOrganization({
        organizationId: "org_missing",
        actorUserId: "admin_1",
      }),
    ).rejects.toThrow("Organization not found");
  });

  it("deleteOrganization deletes from Clerk then local DB", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org_1",
      name: "Org One",
      clerkOrganizationId: "clerk_org_1",
    });
    mocks.deleteClerkOrganization.mockResolvedValue(undefined);
    mocks.organizationDelete.mockResolvedValue({ id: "org_1" });

    const result = await deleteOrganization({
      organizationId: "org_1",
      actorUserId: "admin_1",
    });

    expect(mocks.deleteClerkOrganization).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
    });
    expect(mocks.organizationDelete).toHaveBeenCalledWith({
      where: { id: "org_1" },
    });
    expect(result).toEqual({
      id: "org_1",
      name: "Org One",
    });
  });

  it("deleteOrganization wraps DB failure after Clerk deletion", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org_1",
      name: "Org One",
      clerkOrganizationId: "clerk_org_1",
    });
    mocks.deleteClerkOrganization.mockResolvedValue(undefined);
    mocks.organizationDelete.mockRejectedValue(new Error("db down"));

    await expect(
      deleteOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
      }),
    ).rejects.toMatchObject({
      name: "OrganizationServiceError",
      code: "ORGANIZATION_DB_DELETE_FAILED_AFTER_CLERK",
    });
  });

  it("createOrganizationWithContract creates org and owner membership", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null); // slug uniqueness
    mocks.createClerkOrganization.mockResolvedValue({ id: "clerk_org_1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_1",
      clerkId: "clerk_user_1",
      email: "owner@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_1" });

    const tx = {
      organization: {
        create: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Team Org",
          slug: "team-org",
          contract: { id: "contract_1" },
          ownerUser: { id: "owner_1", email: "owner@test.dev" },
        }),
      },
      organizationMembership: {
        upsert: vi.fn().mockResolvedValue({ id: "membership_1" }),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    const result = await createOrganizationWithContract({
      name: "Team Org",
      ownerEmail: "OWNER@Test.Dev",
      contract: {
        basePlan: "BASIC",
        seatLimit: 5,
        planLabel: "Team",
        modelTier: "BASIC",
        maxRequestsPerDay: 1000,
        maxInputTokensPerDay: 100000,
        maxOutputTokensPerDay: 100000,
        maxCostPerDay: 10,
        maxContextMessages: 20,
      },
      createdByUserId: "admin_1",
    });

    expect(result).toEqual({
      id: "org_1",
      name: "Team Org",
      slug: "team-org",
      contract: { id: "contract_1" },
      ownerUser: { id: "owner_1", email: "owner@test.dev" },
    });
    expect(mocks.addClerkMembership).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      clerkUserId: "clerk_user_1",
      role: "org:admin",
    });
    expect(tx.organizationMembership.upsert).toHaveBeenCalledTimes(1);
  });

  it("createOrganizationWithContract wraps DB failures and compensates Clerk state", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null); // slug uniqueness
    mocks.createClerkOrganization.mockResolvedValue({ id: "clerk_org_1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_1",
      clerkId: "clerk_user_1",
      email: "owner@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_1" });
    mocks.transaction.mockRejectedValue(new Error("tx failed"));
    mocks.removeClerkMembership.mockResolvedValue(undefined);
    mocks.deleteClerkOrganization.mockResolvedValue(undefined);

    await expect(
      createOrganizationWithContract({
        name: "Team Org",
        ownerEmail: "owner@test.dev",
        contract: {
          basePlan: "BASIC",
          seatLimit: 5,
          planLabel: "Team",
          modelTier: "BASIC",
          maxRequestsPerDay: 1000,
          maxInputTokensPerDay: 100000,
          maxOutputTokensPerDay: 100000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        createdByUserId: "admin_1",
      }),
    ).rejects.toMatchObject({
      name: "OrganizationServiceError",
      code: "ORGANIZATION_DB_CREATE_FAILED",
    });

    expect(mocks.removeClerkMembership).toHaveBeenCalledTimes(1);
    expect(mocks.deleteClerkOrganization).toHaveBeenCalledTimes(1);
  });

  it("createOrganizationWithContract invites owner when user is unresolved", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null); // slug uniqueness
    mocks.createClerkOrganization.mockResolvedValue({ id: "clerk_org_1" });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.inviteClerkOwner.mockResolvedValue(undefined);

    const tx = {
      organization: {
        create: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Team Org",
          slug: "team-org",
          contract: { id: "contract_1" },
          ownerUser: null,
        }),
      },
      organizationMembership: {
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await expect(
      createOrganizationWithContract({
        name: "Team Org",
        ownerEmail: "OWNER@EXAMPLE.TEST",
        contract: {
          basePlan: "BASIC",
          seatLimit: 5,
          planLabel: "Team",
          modelTier: "BASIC",
          maxRequestsPerDay: 1000,
          maxInputTokensPerDay: 100000,
          maxOutputTokensPerDay: 100000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        createdByUserId: "admin_1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "org_1",
        ownerUser: null,
      }),
    );

    expect(mocks.inviteClerkOwner).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      ownerEmail: "owner@example.test",
    });
    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: null,
          pendingOwnerEmail: "owner@example.test",
        }),
      }),
    );
    expect(tx.organizationMembership.upsert).not.toHaveBeenCalled();
  });

  it("createOrganizationWithContract throws cleanup-incomplete when Clerk cleanup fails", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null); // slug uniqueness
    mocks.createClerkOrganization.mockResolvedValue({ id: "clerk_org_1" });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.inviteClerkOwner.mockResolvedValue(undefined);
    mocks.transaction.mockRejectedValue(new Error("tx failed"));
    mocks.deleteClerkOrganization.mockRejectedValue(new Error("cleanup failed"));

    await expect(
      createOrganizationWithContract({
        name: "Team Org",
        ownerEmail: "owner@test.dev",
        contract: {
          basePlan: "BASIC",
          seatLimit: 5,
          planLabel: "Team",
          modelTier: "BASIC",
          maxRequestsPerDay: 1000,
          maxInputTokensPerDay: 100000,
          maxOutputTokensPerDay: 100000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        createdByUserId: "admin_1",
      }),
    ).rejects.toMatchObject({
      name: "OrganizationServiceError",
      code: "ORGANIZATION_CREATE_CLEANUP_INCOMPLETE",
    });
  });

  it("createOrganizationWithContract marks cleanup incomplete when membership cleanup fails", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null); // slug uniqueness
    mocks.createClerkOrganization.mockResolvedValue({ id: "clerk_org_1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_1",
      clerkId: "clerk_user_1",
      email: "owner@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_1" });
    mocks.transaction.mockRejectedValue(new Error("tx failed"));
    mocks.removeClerkMembership.mockRejectedValue(new Error("membership cleanup failed"));
    mocks.deleteClerkOrganization.mockResolvedValue(undefined);

    await expect(
      createOrganizationWithContract({
        name: "Team Org",
        ownerEmail: "owner@test.dev",
        contract: {
          basePlan: "BASIC",
          seatLimit: 5,
          planLabel: "Team",
          modelTier: "BASIC",
          maxRequestsPerDay: 1000,
          maxInputTokensPerDay: 100000,
          maxOutputTokensPerDay: 100000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        createdByUserId: "admin_1",
      }),
    ).rejects.toMatchObject({
      name: "OrganizationServiceError",
      code: "ORGANIZATION_CREATE_CLEANUP_INCOMPLETE",
    });
  });

  it("updateOrganization patches Clerk + DB for basic updates", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_1",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });

    const tx = {
      organizationContract: {
        update: vi.fn(),
        create: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "New Name",
          slug: "old-name",
          status: "ACTIVE",
          ownerUserId: "owner_1",
          pendingOwnerEmail: null,
          contract: null,
          ownerUser: { id: "owner_1", email: "owner@test.dev" },
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );
    mocks.updateClerkOrganization.mockResolvedValue(undefined);

    const result = await updateOrganization({
      organizationId: "org_1",
      actorUserId: "admin_1",
      name: "New Name",
    });

    expect(mocks.updateClerkOrganization).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      name: "New Name",
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "org_1",
        name: "New Name",
      }),
    );
  });

  it("updateOrganization reverts Clerk profile when DB transaction fails", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_1",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });

    mocks.updateClerkOrganization.mockResolvedValue(undefined);
    mocks.transaction.mockRejectedValue(new Error("db update failed"));

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        name: "New Name",
      }),
    ).rejects.toThrow("db update failed");

    expect(mocks.updateClerkOrganization).toHaveBeenNthCalledWith(1, {
      clerkOrganizationId: "clerk_org_1",
      name: "New Name",
    });
    expect(mocks.updateClerkOrganization).toHaveBeenNthCalledWith(2, {
      clerkOrganizationId: "clerk_org_1",
      name: "Old Name",
      slug: "old-name",
    });
  });

  it("updateOrganization transfers owner membership and demotes previous owner in Clerk", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [
        {
          id: "membership_old",
          userId: "owner_old",
          clerkMembershipId: "clerk_mem_old",
          user: { clerkId: "clerk_old" },
        },
      ],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: "clerk_new",
      email: "new-owner@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_new" });
    mocks.updateClerkMembershipRole.mockResolvedValue(undefined);

    const tx = {
      organizationContract: {
        update: vi.fn(),
        create: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Old Name",
          slug: "old-name",
          status: "ACTIVE",
          ownerUserId: "owner_new",
          pendingOwnerEmail: null,
          contract: null,
          ownerUser: { id: "owner_new", email: "new-owner@test.dev" },
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "new-owner@test.dev",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "org_1",
        ownerUserId: "owner_new",
      }),
    );

    expect(mocks.addClerkMembership).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      clerkUserId: "clerk_new",
      role: "org:admin",
    });
    expect(tx.organizationMembership.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.organizationMembership.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.updateClerkMembershipRole).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      clerkUserId: "clerk_old",
      clerkMembershipId: "clerk_mem_old",
      role: "org:member",
    });
  });

  it("updateOrganization sets pending owner and invites when owner has no Clerk id", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: null,
      email: "pending-owner@test.dev",
    });
    mocks.inviteClerkOwner.mockResolvedValue(undefined);

    const tx = {
      organizationContract: {
        update: vi.fn(),
        create: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Old Name",
          slug: "old-name",
          status: "ACTIVE",
          ownerUserId: null,
          pendingOwnerEmail: "pending-owner@test.dev",
          contract: null,
          ownerUser: null,
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "pending-owner@test.dev",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "org_1",
        pendingOwnerEmail: "pending-owner@test.dev",
      }),
    );

    expect(mocks.inviteClerkOwner).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      ownerEmail: "pending-owner@test.dev",
    });
    expect(tx.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUser: { disconnect: true },
          pendingOwnerEmail: "pending-owner@test.dev",
        }),
      }),
    );
  });

  it("updateOrganization removes newly created Clerk membership when DB write fails", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [
        {
          id: "membership_old",
          userId: "owner_old",
          clerkMembershipId: "clerk_mem_old",
          user: { clerkId: "clerk_old" },
        },
      ],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: "clerk_new",
      email: "owner-new@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_new" });
    mocks.transaction.mockRejectedValue(new Error("db update failed"));
    mocks.removeClerkMembership.mockResolvedValue(undefined);

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "owner-new@test.dev",
      }),
    ).rejects.toThrow("db update failed");

    expect(mocks.removeClerkMembership).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      clerkUserId: "clerk_new",
      clerkMembershipId: "clerk_mem_new",
    });
  });

  it("updateOrganization ignores Clerk demotion failure after successful transfer", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [
        {
          id: "membership_old",
          userId: "owner_old",
          clerkMembershipId: "clerk_mem_old",
          user: { clerkId: "clerk_old" },
        },
      ],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: "clerk_new",
      email: "owner-new@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_new" });
    mocks.updateClerkMembershipRole.mockRejectedValue(
      new Error("demote failed"),
    );

    const tx = {
      organizationContract: {
        update: vi.fn(),
        create: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Old Name",
          slug: "old-name",
          status: "ACTIVE",
          ownerUserId: "owner_new",
          pendingOwnerEmail: null,
          contract: null,
          ownerUser: { id: "owner_new", email: "owner-new@test.dev" },
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "owner-new@test.dev",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "org_1",
        ownerUserId: "owner_new",
      }),
    );
  });

  it("updateOrganization logs and preserves original failure when Clerk profile revert fails", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_1",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });
    mocks.updateClerkOrganization
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("revert failed"));
    mocks.transaction.mockRejectedValue(new Error("db update failed"));

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        name: "New Name",
      }),
    ).rejects.toThrow("db update failed");
  });

  it("updateOrganization logs and preserves original failure when owner cleanup removal fails", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [
        {
          id: "membership_old",
          userId: "owner_old",
          clerkMembershipId: "clerk_mem_old",
          user: { clerkId: "clerk_old" },
        },
      ],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: "clerk_new",
      email: "owner-new@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({ id: "clerk_mem_new" });
    mocks.transaction.mockRejectedValue(new Error("db update failed"));
    mocks.removeClerkMembership.mockRejectedValue(
      new Error("cleanup remove failed"),
    );

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "owner-new@test.dev",
      }),
    ).rejects.toThrow("db update failed");
  });

  it("updateOrganization applies contract patch create path when contract is absent", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_1",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });

    const tx = {
      organizationContract: {
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Old Name",
          slug: "old-name",
          status: "ACTIVE",
          ownerUserId: "owner_1",
          pendingOwnerEmail: null,
          contract: { id: "contract_1" },
          ownerUser: { id: "owner_1", email: "owner@test.dev" },
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await updateOrganization({
      organizationId: "org_1",
      actorUserId: "admin_1",
      contract: {
        basePlan: "BASIC",
        seatLimit: 12,
        planLabel: "Team Plus",
        modelTier: "BASIC",
        maxRequestsPerDay: 2000,
        maxInputTokensPerDay: 200000,
        maxOutputTokensPerDay: 200000,
        maxCostPerDay: 20,
        maxContextMessages: 30,
      },
    });

    expect(tx.organizationContract.create).toHaveBeenCalledTimes(1);
    expect(tx.organizationContract.update).not.toHaveBeenCalled();
  });

  it("updateOrganization applies slug patch and contract update path when contract exists", async () => {
    mocks.organizationFindUnique
      .mockResolvedValueOnce({
        id: "org_1",
        name: "Old Name",
        slug: "old-name",
        status: "ACTIVE",
        ownerUserId: "owner_1",
        pendingOwnerEmail: null,
        clerkOrganizationId: "clerk_org_1",
        contract: {
          id: "contract_1",
          basePlan: "BASIC",
          planLabel: "Base",
          modelTier: "BASIC",
          seatLimit: 5,
          maxRequestsPerDay: 1000,
          maxInputTokensPerDay: 100000,
          maxOutputTokensPerDay: 100000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        memberships: [],
      })
      .mockResolvedValueOnce(null); // ensureUniqueSlug lookup for new slug

    mocks.updateClerkOrganization.mockResolvedValue(undefined);

    const tx = {
      organizationContract: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({
          id: "org_1",
          name: "Old Name",
          slug: "new-slug",
          status: "ACTIVE",
          ownerUserId: "owner_1",
          pendingOwnerEmail: null,
          contract: { id: "contract_1" },
          ownerUser: { id: "owner_1", email: "owner@test.dev" },
        }),
      },
      organizationMembership: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      organizationAuditLog: {
        create: vi.fn(),
      },
    };
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) =>
      await fn(tx),
    );

    await updateOrganization({
      organizationId: "org_1",
      actorUserId: "admin_1",
      slug: "new-slug",
      contract: {
        basePlan: "BASIC",
        seatLimit: 6,
        planLabel: "Base Plus",
        modelTier: "BASIC",
        maxRequestsPerDay: 1100,
        maxInputTokensPerDay: 110000,
        maxOutputTokensPerDay: 110000,
        maxCostPerDay: 11,
        maxContextMessages: 21,
      },
    });

    expect(mocks.updateClerkOrganization).toHaveBeenCalledWith({
      clerkOrganizationId: "clerk_org_1",
      slug: "new-slug",
    });
    expect(tx.organizationContract.update).toHaveBeenCalledTimes(1);
    expect(tx.organizationContract.create).not.toHaveBeenCalled();
  });

  it("updateOrganization throws when Clerk owner membership is created without id", async () => {
    mocks.organizationFindUnique.mockResolvedValueOnce({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_old",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "owner_new",
      clerkId: "clerk_new",
      email: "owner-new@test.dev",
    });
    mocks.addClerkMembership.mockResolvedValue({});

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        ownerEmail: "owner-new@test.dev",
      }),
    ).rejects.toThrow("Failed to create Clerk owner membership");
  });

  it("updateOrganization rejects empty name and empty slug", async () => {
    mocks.organizationFindUnique.mockResolvedValue({
      id: "org_1",
      name: "Old Name",
      slug: "old-name",
      status: "ACTIVE",
      ownerUserId: "owner_1",
      pendingOwnerEmail: null,
      clerkOrganizationId: "clerk_org_1",
      contract: null,
      memberships: [],
    });

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        name: "   ",
      }),
    ).rejects.toThrow("name is required");

    await expect(
      updateOrganization({
        organizationId: "org_1",
        actorUserId: "admin_1",
        slug: "   ",
      }),
    ).rejects.toThrow("slug is required");
  });
});
