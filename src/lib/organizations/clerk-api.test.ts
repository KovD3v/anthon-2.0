import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

import {
  CLERK_MEMBER_ROLE,
  CLERK_OWNER_ROLE,
  addClerkMembership,
  callClerkMethod,
  createClerkOrganization,
  deleteClerkOrganization,
  getString,
  inviteClerkOwner,
  removeClerkMembership,
  updateClerkMembershipRole,
  updateClerkOrganization,
} from "./clerk-api";

function setOrganizationsApi(api: Record<string, unknown>) {
  mocks.clerkClient.mockResolvedValue({ organizations: api });
}

describe("organizations/clerk-api", () => {
  beforeEach(() => {
    mocks.clerkClient.mockReset();
  });

  it("exports stable Clerk role constants", () => {
    expect(CLERK_OWNER_ROLE).toBe("org:admin");
    expect(CLERK_MEMBER_ROLE).toBe("org:member");
  });

  it("getString returns non-empty strings and null otherwise", () => {
    expect(getString("value")).toBe("value");
    expect(getString("")).toBeNull();
    expect(getString(null)).toBeNull();
    expect(getString(123)).toBeNull();
  });

  it("callClerkMethod invokes the first compatible method", async () => {
    const createOrganization = vi.fn().mockResolvedValue({ id: "org_1" });
    setOrganizationsApi({ createOrganization });

    const result = await callClerkMethod<{ id: string }>(
      ["createOrganization", "create"],
      { name: "Anthon", slug: "anthon" },
    );

    expect(createOrganization).toHaveBeenCalledWith({
      name: "Anthon",
      slug: "anthon",
    });
    expect(result).toEqual({ id: "org_1" });
  });

  it("callClerkMethod falls back to later method names", async () => {
    const create = vi.fn().mockResolvedValue({ id: "org_2" });
    setOrganizationsApi({ create });

    const result = await callClerkMethod<{ id: string }>(
      ["createOrganization", "create"],
      { name: "Fallback Org", slug: "fallback-org" },
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("org_2");
  });

  it("callClerkMethod throws when organizations API is missing", async () => {
    mocks.clerkClient.mockResolvedValue({});

    await expect(callClerkMethod(["create"], {})).rejects.toThrow(
      "Clerk organizations API is not available",
    );
  });

  it("callClerkMethod throws when no compatible method exists", async () => {
    setOrganizationsApi({});

    await expect(callClerkMethod(["missingOne", "missingTwo"], {})).rejects
      .toThrow("No compatible Clerk method found (missingOne, missingTwo)");
  });

  it("createClerkOrganization returns normalized id", async () => {
    const createOrganization = vi.fn().mockResolvedValue({ id: "org_created" });
    setOrganizationsApi({ createOrganization });

    const result = await createClerkOrganization({
      name: "Created Org",
      slug: "created-org",
    });

    expect(result).toEqual({ id: "org_created" });
  });

  it("createClerkOrganization throws when Clerk response has no id", async () => {
    const createOrganization = vi.fn().mockResolvedValue({});
    setOrganizationsApi({ createOrganization });

    await expect(
      createClerkOrganization({ name: "No Id", slug: "no-id" }),
    ).rejects.toThrow("Clerk organization creation did not return an id");
  });

  it("deleteClerkOrganization forwards both organizationId and id", async () => {
    const deleteOrganization = vi.fn().mockResolvedValue(undefined);
    setOrganizationsApi({ deleteOrganization });

    await deleteClerkOrganization({ clerkOrganizationId: "org_delete" });

    expect(deleteOrganization).toHaveBeenCalledWith({
      organizationId: "org_delete",
      id: "org_delete",
    });
  });

  it("updateClerkOrganization supports two-argument SDK signature", async () => {
    const updateOrganization = vi.fn().mockResolvedValue(undefined);
    setOrganizationsApi({ updateOrganization });

    await updateClerkOrganization({
      clerkOrganizationId: "org_1",
      name: "Updated Name",
    });

    expect(updateOrganization).toHaveBeenCalledWith("org_1", {
      name: "Updated Name",
    });
  });

  it("updateClerkOrganization falls back to payload signature when needed", async () => {
    const updateOrganization = vi
      .fn()
      .mockRejectedValueOnce(new Error("two-arg not supported"))
      .mockResolvedValueOnce(undefined);
    setOrganizationsApi({ updateOrganization });

    await updateClerkOrganization({
      clerkOrganizationId: "org_2",
      slug: "updated-slug",
    });

    expect(updateOrganization).toHaveBeenNthCalledWith(1, "org_2", {
      slug: "updated-slug",
    });
    expect(updateOrganization).toHaveBeenNthCalledWith(2, {
      organizationId: "org_2",
      slug: "updated-slug",
    });
  });

  it("updateClerkOrganization throws the last SDK error when all attempts fail", async () => {
    const updateOrganization = vi
      .fn()
      .mockRejectedValue(new Error("update failed"));
    setOrganizationsApi({ updateOrganization });

    await expect(
      updateClerkOrganization({
        clerkOrganizationId: "org_3",
        name: "Will Fail",
      }),
    ).rejects.toThrow("update failed");
    expect(updateOrganization).toHaveBeenCalledTimes(3);
  });

  it("updateClerkOrganization throws when no compatible update methods exist", async () => {
    setOrganizationsApi({});

    await expect(
      updateClerkOrganization({ clerkOrganizationId: "org_4", name: "Noop" }),
    ).rejects.toThrow("No compatible Clerk update method found");
  });

  it("membership and invitation helpers pass expected payloads", async () => {
    const createOrganizationMembership = vi
      .fn()
      .mockResolvedValue({ id: "mem_1" });
    const createOrganizationInvitation = vi.fn().mockResolvedValue({});
    const updateOrganizationMembership = vi.fn().mockResolvedValue({});
    const deleteOrganizationMembership = vi.fn().mockResolvedValue({});

    setOrganizationsApi({
      createOrganizationMembership,
      createOrganizationInvitation,
      updateOrganizationMembership,
      deleteOrganizationMembership,
    });

    await expect(
      addClerkMembership({
        clerkOrganizationId: "org_1",
        clerkUserId: "user_1",
        role: CLERK_MEMBER_ROLE,
      }),
    ).resolves.toEqual({ id: "mem_1" });

    await inviteClerkOwner({
      clerkOrganizationId: "org_1",
      ownerEmail: "owner@example.com",
    });

    await updateClerkMembershipRole({
      clerkOrganizationId: "org_1",
      clerkUserId: "user_1",
      clerkMembershipId: "mem_1",
      role: CLERK_OWNER_ROLE,
    });

    await removeClerkMembership({
      clerkOrganizationId: "org_1",
      clerkUserId: "user_1",
      clerkMembershipId: "mem_1",
    });

    expect(createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      role: CLERK_MEMBER_ROLE,
    });
    expect(createOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      emailAddress: "owner@example.com",
      role: CLERK_OWNER_ROLE,
    });
    expect(updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      membershipId: "mem_1",
      role: CLERK_OWNER_ROLE,
    });
    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      membershipId: "mem_1",
    });
  });
});
