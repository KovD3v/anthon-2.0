import { describe, expect, it } from "vitest";
import { randomizeVariantSlots, selectVariantIdForChoice } from "./mapping";

describe("model comparison pair mapping", () => {
  const control = { id: "control" };
  const candidate = { id: "candidate" };

  it("persists deterministic randomized A/B mappings", () => {
    expect(randomizeVariantSlots(control, candidate, () => 0.1)).toEqual({
      slotA: control,
      slotB: candidate,
    });
    expect(randomizeVariantSlots(control, candidate, () => 0.9)).toEqual({
      slotA: candidate,
      slotB: control,
    });
  });

  it("maps anonymous votes and always resolves ties to control", () => {
    const input = {
      slotAVariantId: "candidate",
      slotBVariantId: "control",
      controlVariantId: "control",
    };
    expect(selectVariantIdForChoice({ ...input, choice: "A" })).toBe(
      "candidate",
    );
    expect(selectVariantIdForChoice({ ...input, choice: "B" })).toBe("control");
    expect(selectVariantIdForChoice({ ...input, choice: "TIE" })).toBe(
      "control",
    );
  });
});
