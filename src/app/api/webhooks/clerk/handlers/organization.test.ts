import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncOrganizationFromClerkEvent: vi.fn(),
  syncMembershipFromClerkEvent: vi.fn(),
}));

vi.mock("@/lib/organizations/service", () => ({
  syncOrganizationFromClerkEvent: mocks.syncOrganizationFromClerkEvent,
  syncMembershipFromClerkEvent: mocks.syncMembershipFromClerkEvent,
}));

import {
  handleOrganizationDeleted,
  handleOrganizationInvitationAccepted,
  handleOrganizationMembershipDeleted,
  handleOrganizationMembershipUpsert,
  handleOrganizationUpsert,
} from "./organization";

describe("clerk webhook organization handlers", () => {
  beforeEach(() => {
    mocks.syncOrganizationFromClerkEvent.mockReset();
    mocks.syncMembershipFromClerkEvent.mockReset();
    mocks.syncOrganizationFromClerkEvent.mockResolvedValue(undefined);
    mocks.syncMembershipFromClerkEvent.mockResolvedValue({
      synced: true,
      reason: "ok",
    });
  });

  it("handleOrganizationUpsert ignores payloads without id", async () => {
    await handleOrganizationUpsert({ name: "Org" });

    expect(mocks.syncOrganizationFromClerkEvent).not.toHaveBeenCalled();
  });

  it("handleOrganizationUpsert syncs organization fields", async () => {
    await handleOrganizationUpsert({
      id: "org_clerk_1",
      name: "My Org",
      slug: "my-org",
    });

    expect(mocks.syncOrganizationFromClerkEvent).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk_1",
      name: "My Org",
      slug: "my-org",
    });
  });

  it("handleOrganizationDeleted syncs archived status", async () => {
    await handleOrganizationDeleted({ id: "org_clerk_1" });

    expect(mocks.syncOrganizationFromClerkEvent).toHaveBeenCalledWith({
      clerkOrganizationId: "org_clerk_1",
      status: "ARCHIVED",
    });
  });

  it("handleOrganizationMembershipUpsert reads direct fields", async () => {
    await handleOrganizationMembershipUpsert({
      id: "mem_1",
      organization_id: "org_1",
      user_id: "user_1",
      role: "org:member",
      status: "active",
    });

    expect(mocks.syncMembershipFromClerkEvent).toHaveBeenCalledWith({
      clerkMembershipId: "mem_1",
      clerkOrganizationId: "org_1",
      clerkUserId: "user_1",
      role: "org:member",
      status: "ACTIVE",
    });
  });

  it("handleOrganizationMembershipUpsert resolves fallback nested fields", async () => {
    await handleOrganizationMembershipUpsert({
      id: "mem_2",
      organization: { id: "org_nested" },
      publicUserData: { userId: "user_nested" },
      role: "org:admin",
      status: "blocked",
    });

    expect(mocks.syncMembershipFromClerkEvent).toHaveBeenCalledWith({
      clerkMembershipId: "mem_2",
      clerkOrganizationId: "org_nested",
      clerkUserId: "user_nested",
      role: "org:admin",
      status: "BLOCKED",
    });
  });

  it("handleOrganizationMembershipDeleted sets REMOVED status", async () => {
    await handleOrganizationMembershipDeleted({
      id: "mem_3",
      organization: { id: "org_3" },
      user: { id: "user_3" },
      role: "org:member",
    });

    expect(mocks.syncMembershipFromClerkEvent).toHaveBeenCalledWith({
      clerkMembershipId: "mem_3",
      clerkOrganizationId: "org_3",
      clerkUserId: "user_3",
      role: "org:member",
      status: "REMOVED",
    });
  });

  it("handleOrganizationInvitationAccepted waits when membership id is missing", async () => {
    await handleOrganizationInvitationAccepted({
      id: "inv_1",
      organization_id: "org_1",
      user_id: "user_1",
      role: "org:member",
    });

    expect(mocks.syncMembershipFromClerkEvent).not.toHaveBeenCalled();
  });

  it("handleOrganizationInvitationAccepted syncs ACTIVE when membership id is present", async () => {
    await handleOrganizationInvitationAccepted({
      id: "inv_2",
      organization_id: "org_1",
      user_id: "user_1",
      role: "org:admin",
      // This key exists at runtime but is not part of static type.
      ...({ organizationMembershipId: "mem_4" } as Record<string, unknown>),
    });

    expect(mocks.syncMembershipFromClerkEvent).toHaveBeenCalledWith({
      clerkMembershipId: "mem_4",
      clerkOrganizationId: "org_1",
      clerkUserId: "user_1",
      role: "org:admin",
      status: "ACTIVE",
    });
  });

  it("membership handlers skip sync when required ids are missing", async () => {
    await handleOrganizationMembershipUpsert({ id: "mem_only" });
    await handleOrganizationMembershipDeleted({ id: "mem_only" });

    expect(mocks.syncMembershipFromClerkEvent).not.toHaveBeenCalled();
  });
});
