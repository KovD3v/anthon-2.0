import { describe, expect, it } from "vitest";

import { mapMembershipStatus, readString } from "./types";

describe("clerk webhook handler types helpers", () => {
  it("readString returns non-empty strings only", () => {
    expect(readString({ id: "abc" }, "id")).toBe("abc");
    expect(readString({ id: "" }, "id")).toBeNull();
    expect(readString({ id: 42 }, "id")).toBeNull();
    expect(readString({}, "missing")).toBeNull();
  });

  it("mapMembershipStatus maps blocked statuses", () => {
    expect(mapMembershipStatus("blocked")).toBe("BLOCKED");
    expect(mapMembershipStatus("user_blocked")).toBe("BLOCKED");
  });

  it("mapMembershipStatus maps removed statuses", () => {
    expect(mapMembershipStatus("removed")).toBe("REMOVED");
    expect(mapMembershipStatus("deleted")) .toBe("REMOVED");
  });

  it("mapMembershipStatus defaults to active", () => {
    expect(mapMembershipStatus("active")).toBe("ACTIVE");
    expect(mapMembershipStatus(undefined)).toBe("ACTIVE");
    expect(mapMembershipStatus("anything_else")).toBe("ACTIVE");
  });
});
