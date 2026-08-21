import { describe, expect, it } from "vitest";
import { getAdminNavItems } from "./layout-client";

describe("admin navigation permissions", () => {
  it("shows Beta only to SUPER_ADMIN", () => {
    expect(getAdminNavItems(false).map((item) => item.label)).not.toContain(
      "Beta",
    );
    expect(getAdminNavItems(true).map((item) => item.label)).toContain("Beta");
  });
});
