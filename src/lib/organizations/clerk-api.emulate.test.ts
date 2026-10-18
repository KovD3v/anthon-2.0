import { createClerkClient } from "@clerk/nextjs/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addClerkMembership,
  CLERK_MEMBER_ROLE,
  CLERK_OWNER_ROLE,
  createClerkOrganization,
  deleteClerkOrganization,
  inviteClerkOwner,
  removeClerkMembership,
  updateClerkMembershipRole,
  updateClerkOrganization,
} from "./clerk-api";

// Real @clerk/nextjs clerkClient calls against the Emulate Clerk Backend API.
const clerk = () =>
  createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    apiUrl: process.env.CLERK_API_URL,
  });

describe("Clerk organization wrappers against Emulate", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await clerk().users.createUser({
      emailAddress: [`owner-${Date.now()}@example.com`],
      firstName: "Org",
      lastName: "Owner",
    });
    userId = user.id;
  });

  it("creates, updates, staffs and deletes an organization", async () => {
    const slug = `acme-${Date.now()}`;
    const { id } = await createClerkOrganization({ name: "Acme", slug });
    expect(id).toMatch(/^org_/);

    await updateClerkOrganization({
      clerkOrganizationId: id,
      name: "Acme Coaching",
    });
    expect(
      (await clerk().organizations.getOrganization({ organizationId: id }))
        .name,
    ).toBe("Acme Coaching");

    const membership = await addClerkMembership({
      clerkOrganizationId: id,
      clerkUserId: userId,
      role: CLERK_MEMBER_ROLE,
    });
    expect(membership.id).toMatch(/^orgmem_/);

    await updateClerkMembershipRole({
      clerkOrganizationId: id,
      clerkUserId: userId,
      clerkMembershipId: membership.id as string,
      role: CLERK_OWNER_ROLE,
    });
    const members = await clerk().organizations.getOrganizationMembershipList({
      organizationId: id,
    });
    expect(members.data.map((m) => [m.publicUserData?.userId, m.role])).toEqual(
      [[userId, CLERK_OWNER_ROLE]],
    );

    await inviteClerkOwner({
      clerkOrganizationId: id,
      ownerEmail: "new-owner@example.com",
    });
    const invitations =
      await clerk().organizations.getOrganizationInvitationList({
        organizationId: id,
      });
    expect(invitations.data.map((i) => [i.emailAddress, i.role])).toEqual([
      ["new-owner@example.com", CLERK_OWNER_ROLE],
    ]);

    await removeClerkMembership({
      clerkOrganizationId: id,
      clerkUserId: userId,
      clerkMembershipId: membership.id as string,
    });
    expect(
      (
        await clerk().organizations.getOrganizationMembershipList({
          organizationId: id,
        })
      ).totalCount,
    ).toBe(0);

    await deleteClerkOrganization({ clerkOrganizationId: id });
    await expect(
      clerk().organizations.getOrganization({ organizationId: id }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
