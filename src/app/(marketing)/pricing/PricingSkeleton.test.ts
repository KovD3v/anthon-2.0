import { describe, expect, it } from "vitest";
import { PERSONAL_PLAN_LABELS } from "./PricingSkeleton";

describe("PricingSkeleton", () => {
  it("uses the same plan names shown by the loaded pricing table", () => {
    expect(PERSONAL_PLAN_LABELS).toEqual(["Basic", "Basic Plus", "Pro"]);
  });
});
