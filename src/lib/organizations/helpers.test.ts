import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: {
      findUnique: mocks.organizationFindUnique,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

import {
  ensureUniqueSlug,
  getRoleFromClerkMembership,
  isSerializationFailure,
  jsonValue,
  resolveOwnerByEmail,
  sanitizeContractInput,
  slugify,
} from "./helpers";

describe("organizations/helpers", () => {
  beforeEach(() => {
    mocks.organizationFindUnique.mockReset();
    mocks.userFindUnique.mockReset();
  });

  it("slugifies values with normalization and length cap", () => {
    expect(slugify("  ACME Team 2026!  ")).toBe("acme-team-2026");
    expect(slugify("a".repeat(80))).toHaveLength(48);
  });

  it("sanitizes contract input and normalizes numeric fields", () => {
    const result = sanitizeContractInput({
      basePlan: "BASIC",
      planLabel: "  Team Basic  ",
      modelTier: "BASIC",
      seatLimit: 12.9,
      maxRequestsPerDay: 80.8,
      maxInputTokensPerDay: 900_000.9,
      maxOutputTokensPerDay: 450_000.1,
      maxCostPerDay: 6.25,
      maxContextMessages: 20.7,
    });

    expect(result).toEqual({
      basePlan: "BASIC",
      planLabel: "Team Basic",
      modelTier: "BASIC",
      seatLimit: 12,
      maxRequestsPerDay: 80,
      maxInputTokensPerDay: 900000,
      maxOutputTokensPerDay: 450000,
      maxCostPerDay: 6.25,
      maxContextMessages: 20,
    });
  });

  it("rejects invalid contract inputs", () => {
    expect(() =>
      sanitizeContractInput({
        basePlan: "INVALID" as unknown as "BASIC",
        planLabel: "x",
        modelTier: "BASIC",
        seatLimit: 1,
        maxRequestsPerDay: 1,
        maxInputTokensPerDay: 1,
        maxOutputTokensPerDay: 1,
        maxCostPerDay: 0,
        maxContextMessages: 1,
      }),
    ).toThrow("Invalid basePlan");

    expect(() =>
      sanitizeContractInput({
        basePlan: "BASIC",
        planLabel: "x",
        modelTier: "INVALID" as unknown as "BASIC",
        seatLimit: 1,
        maxRequestsPerDay: 1,
        maxInputTokensPerDay: 1,
        maxOutputTokensPerDay: 1,
        maxCostPerDay: 0,
        maxContextMessages: 1,
      }),
    ).toThrow("Invalid modelTier");

    expect(() =>
      sanitizeContractInput({
        basePlan: "BASIC",
        planLabel: "   ",
        modelTier: "BASIC",
        seatLimit: 1,
        maxRequestsPerDay: 1,
        maxInputTokensPerDay: 1,
        maxOutputTokensPerDay: 1,
        maxCostPerDay: 0,
        maxContextMessages: 1,
      }),
    ).toThrow("planLabel is required");
  });

  it("detects serialization failures", () => {
    expect(isSerializationFailure({ code: "P2034" })).toBe(true);
    expect(isSerializationFailure({ code: "P2002" })).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
  });

  it("maps Clerk roles to organization roles", () => {
    expect(getRoleFromClerkMembership(null)).toBe("MEMBER");
    expect(getRoleFromClerkMembership("org:admin")).toBe("OWNER");
    expect(getRoleFromClerkMembership("OWNER")).toBe("OWNER");
    expect(getRoleFromClerkMembership("member")).toBe("MEMBER");
  });

  it("returns a unique slug when not already taken", async () => {
    mocks.organizationFindUnique.mockResolvedValue(null);

    const result = await ensureUniqueSlug("acme");

    expect(result).toBe("acme");
    expect(mocks.organizationFindUnique).toHaveBeenCalledWith({
      where: { slug: "acme" },
      select: { id: true },
    });
  });

  it("increments slug suffix when conflicts exist", async () => {
    mocks.organizationFindUnique
      .mockResolvedValueOnce({ id: "org-1" })
      .mockResolvedValueOnce({ id: "org-2" })
      .mockResolvedValueOnce(null);

    const result = await ensureUniqueSlug("acme");

    expect(result).toBe("acme-3");
  });

  it("accepts existing slug when it belongs to excluded organization", async () => {
    mocks.organizationFindUnique.mockResolvedValue({ id: "org-1" });

    const result = await ensureUniqueSlug("acme", {
      excludeOrganizationId: "org-1",
    });

    expect(result).toBe("acme");
  });

  it("uses org-timestamp fallback when base slug is empty", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1234567890);
    mocks.organizationFindUnique.mockResolvedValue(null);

    const result = await ensureUniqueSlug("");

    expect(result).toBe("org-1234567890");
    dateNowSpy.mockRestore();
  });

  it("throws when unable to generate unique slug after max attempts", async () => {
    mocks.organizationFindUnique.mockResolvedValue({ id: "occupied" });

    await expect(ensureUniqueSlug("acme")).rejects.toThrow(
      "Unable to generate unique organization slug",
    );
    expect(mocks.organizationFindUnique).toHaveBeenCalledTimes(100);
  });

  it("forwards owner lookup by email", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      clerkId: "clerk_123",
      email: "owner@example.com",
    });

    const result = await resolveOwnerByEmail("owner@example.com");

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      select: {
        id: true,
        clerkId: true,
        email: true,
      },
    });
    expect(result).toEqual({
      id: "u1",
      clerkId: "clerk_123",
      email: "owner@example.com",
    });
  });

  it("returns the same reference in jsonValue helper", () => {
    const source = { key: "value" };
    const result = jsonValue(source);
    expect(result).toBe(source);
  });
});
