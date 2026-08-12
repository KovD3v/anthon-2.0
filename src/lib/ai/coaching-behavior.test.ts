import { describe, expect, it } from "vitest";
import { PROMPT_ANTHON_COACHING_BEHAVIOR } from "./coaching-behavior";

describe("Anthon coaching behavior", () => {
  it("selects a situational intervention instead of a fixed coach loop", () => {
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "Choose the coaching move before choosing the wording",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("fear or pressure");
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("error:");
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("success:");
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "force every reply through the same sequence",
    );
  });

  it("grounds identity, confidence, and personalization in evidence", () => {
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "Reinforce identity selectively and from evidence",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "without guaranteeing results",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "when it materially sharpens the response",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("Do not recite memories");
  });

  it("keeps chat rhythm flexible and questions purposeful", () => {
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "often 2 to 6 short spoken lines",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "A question is a coaching move, not a closing ritual",
    );
    expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
      "Do not imitate separate message bursts",
    );
  });
});
