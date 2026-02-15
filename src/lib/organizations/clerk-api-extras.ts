/**
 * Organization Module — additional Clerk API convenience wrappers.
 *
 * Separated from clerk-api.ts to avoid circular dependency back into service.ts.
 */

import { CLERK_MEMBER_ROLE, updateClerkMembershipRole } from "./clerk-api";

export async function demoteMembershipToMember(input: {
  clerkOrganizationId: string;
  clerkUserId: string;
  clerkMembershipId: string;
}) {
  await updateClerkMembershipRole({
    clerkOrganizationId: input.clerkOrganizationId,
    clerkUserId: input.clerkUserId,
    clerkMembershipId: input.clerkMembershipId,
    role: CLERK_MEMBER_ROLE,
  });
}
