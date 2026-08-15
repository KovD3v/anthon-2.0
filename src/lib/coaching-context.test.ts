import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { coachingProfilePatchSchema } from "./coaching-context";

describe("coachingProfilePatchSchema", () => {
  it("accepts an optional age and occupation", () => {
    expect(
      coachingProfilePatchSchema.parse({
        age: 24,
        occupation: "Studentessa di medicina",
      }),
    ).toEqual({ age: 24, occupation: "Studentessa di medicina" });
  });

  it("rejects implausible ages", () => {
    expect(coachingProfilePatchSchema.safeParse({ age: 0 }).success).toBe(
      false,
    );
    expect(coachingProfilePatchSchema.safeParse({ age: 121 }).success).toBe(
      false,
    );
  });
});
