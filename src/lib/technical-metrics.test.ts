import { describe, expect, it } from "vitest";
import { resolveTechnicalMetricsVisibility } from "./technical-metrics";

describe("resolveTechnicalMetricsVisibility", () => {
  it.each([
    {
      role: "USER",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "ADMIN",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "SUPER_ADMIN",
      preference: null,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "ADMIN",
      preference: false,
      isGuest: false,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "USER",
      preference: true,
      isGuest: false,
      isPrivateOwner: true,
      expected: true,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: true,
      isPrivateOwner: true,
      expected: false,
    },
    {
      role: "SUPER_ADMIN",
      preference: true,
      isGuest: false,
      isPrivateOwner: false,
      expected: false,
    },
  ] as const)("returns $expected for %o", ({ expected, ...input }) => {
    expect(resolveTechnicalMetricsVisibility(input)).toBe(expected);
  });
});
