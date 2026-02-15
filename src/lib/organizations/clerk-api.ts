/**
 * Organization Module — Clerk API wrappers.
 *
 * All calls to the Clerk Organizations REST API are centralised here.
 */

import { clerkClient } from "@clerk/nextjs/server";

const CLERK_OWNER_ROLE = "org:admin";
const CLERK_MEMBER_ROLE = "org:member";

export { CLERK_MEMBER_ROLE, CLERK_OWNER_ROLE };

// ---------------------------------------------------------------------------
// Low-level SDK helpers
// ---------------------------------------------------------------------------

async function getClerkOrgsApi(): Promise<Record<string, unknown>> {
  const client = (await clerkClient()) as unknown as {
    organizations?: Record<string, unknown>;
  };

  if (!client.organizations) {
    throw new Error("Clerk organizations API is not available");
  }

  return client.organizations;
}

export async function callClerkMethod<T = unknown>(
  methods: string[],
  args: Record<string, unknown>,
): Promise<T> {
  const organizationsApi = await getClerkOrgsApi();

  for (const methodName of methods) {
    const candidate = organizationsApi[methodName];
    if (typeof candidate === "function") {
      return (
        candidate as (
          this: Record<string, unknown>,
          payload: Record<string, unknown>,
        ) => Promise<T>
      ).call(organizationsApi, args);
    }
  }

  throw new Error(`No compatible Clerk method found (${methods.join(", ")})`);
}

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

export async function createClerkOrganization(input: {
  name: string;
  slug: string;
}): Promise<{ id: string }> {
  const organization = await callClerkMethod<{ id?: string }>(
    ["createOrganization", "create"],
    {
      name: input.name,
      slug: input.slug,
    },
  );

  const clerkOrganizationId = getId(organization);
  if (!clerkOrganizationId) {
    throw new Error("Clerk organization creation did not return an id");
  }

  return { id: clerkOrganizationId };
}

export async function deleteClerkOrganization(input: {
  clerkOrganizationId: string;
}): Promise<void> {
  await callClerkMethod(["deleteOrganization", "delete"], {
    organizationId: input.clerkOrganizationId,
    id: input.clerkOrganizationId,
  });
}

export async function updateClerkOrganization(input: {
  clerkOrganizationId: string;
  name?: string;
  slug?: string;
}): Promise<void> {
  const organizationsApi = await getClerkOrgsApi();
  const patch = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.slug ? { slug: input.slug } : {}),
  };

  const methods = ["updateOrganization", "update"];
  let lastError: unknown = null;

  for (const methodName of methods) {
    const candidate = organizationsApi[methodName];
    if (typeof candidate !== "function") {
      continue;
    }

    // Clerk SDK signatures vary across versions:
    // - updateOrganization(organizationId, params)
    // - update({ organizationId, ...params })
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        (
          candidate as (
            this: Record<string, unknown>,
            organizationId: string,
            payload: Record<string, unknown>,
          ) => Promise<unknown>
        ).call(organizationsApi, input.clerkOrganizationId, patch),
      () =>
        (
          candidate as (
            this: Record<string, unknown>,
            payload: Record<string, unknown>,
          ) => Promise<unknown>
        ).call(organizationsApi, {
          organizationId: input.clerkOrganizationId,
          ...patch,
        }),
      () =>
        (
          candidate as (
            this: Record<string, unknown>,
            payload: Record<string, unknown>,
          ) => Promise<unknown>
        ).call(organizationsApi, {
          id: input.clerkOrganizationId,
          ...patch,
        }),
    ];

    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("No compatible Clerk update method found");
}

// ---------------------------------------------------------------------------
// Membership CRUD
// ---------------------------------------------------------------------------

export async function addClerkMembership(input: {
  clerkOrganizationId: string;
  clerkUserId: string;
  role: string;
}): Promise<{ id: string | null }> {
  const membership = await callClerkMethod<{ id?: string }>(
    ["createOrganizationMembership", "createMembership"],
    {
      organizationId: input.clerkOrganizationId,
      userId: input.clerkUserId,
      role: input.role,
    },
  );

  return { id: getId(membership) };
}

export async function inviteClerkOwner(input: {
  clerkOrganizationId: string;
  ownerEmail: string;
}): Promise<void> {
  await callClerkMethod(["createOrganizationInvitation", "createInvitation"], {
    organizationId: input.clerkOrganizationId,
    emailAddress: input.ownerEmail,
    role: CLERK_OWNER_ROLE,
  });
}

export async function updateClerkMembershipRole(input: {
  clerkOrganizationId: string;
  clerkUserId: string;
  clerkMembershipId: string;
  role: string;
}): Promise<void> {
  await callClerkMethod(["updateOrganizationMembership", "updateMembership"], {
    organizationId: input.clerkOrganizationId,
    userId: input.clerkUserId,
    membershipId: input.clerkMembershipId,
    role: input.role,
  });
}

export async function removeClerkMembership(input: {
  clerkOrganizationId: string;
  clerkUserId: string;
  clerkMembershipId: string;
}): Promise<void> {
  await callClerkMethod(["deleteOrganizationMembership", "deleteMembership"], {
    organizationId: input.clerkOrganizationId,
    userId: input.clerkUserId,
    membershipId: input.clerkMembershipId,
  });
}

// ---------------------------------------------------------------------------
// Tiny helpers shared with service.ts
// ---------------------------------------------------------------------------

export function getId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
