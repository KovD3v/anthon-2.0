import { describe, expect, it } from "vitest";
import { canonicalizeKnowledgeCandidate } from "./memory-canonicalization";

describe("memory knowledge canonicalization", () => {
  it.each([
    ["User Name", "profile", "name", "user_name"],
    ["user_sport", "profile", "sport", "user_sport"],
    ["primary-goal", "profile", "goal", "user_goal"],
    ["preferred tone", "preferences", "tone", "preferred_tone"],
    ["response_mode", "preferences", "mode", "response_mode"],
    ["preferred-language", "preferences", "language", "preferred_language"],
  ])(
    "routes %s to its canonical owner",
    (key, destination, field, canonicalKey) => {
      expect(
        canonicalizeKnowledgeCandidate({
          key,
          value: "Tennis",
          category: "preference",
        }),
      ).toEqual({
        destination,
        field,
        key: canonicalKey,
        value: "Tennis",
        category: "preference",
      });
    },
  );

  it("normalizes a flexible coaching fact to a stable key", () => {
    expect(
      canonicalizeKnowledgeCandidate({
        key: "  Blocco Mentale--Prima del Servizio  ",
        value: "Accelera il rituale quando è sotto pressione",
        category: "other",
      }),
    ).toEqual({
      destination: "memory",
      key: "blocco_mentale_prima_del_servizio",
      value: "Accelera il rituale quando è sotto pressione",
      category: "other",
    });
  });

  it.each([
    { key: "*", value: "Qualsiasi cosa", category: "other" },
    { key: "other", value: "Qualsiasi cosa", category: "other" },
    { key: "valid_key", value: "   ", category: "other" },
  ])("rejects an unsafe or content-free candidate %#", (candidate) => {
    expect(canonicalizeKnowledgeCandidate(candidate)).toBeNull();
  });
});
