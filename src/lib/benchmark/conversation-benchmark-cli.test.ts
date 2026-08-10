import { describe, expect, it } from "vitest";
import {
  assertConversationDbMutationAllowed,
  parseConversationBenchmarkArgs,
} from "./conversation-benchmark-cli";

describe("benchmark/conversation-benchmark-cli", () => {
  it("parses baseline, candidate, and compare", () => {
    expect(
      parseConversationBenchmarkArgs([
        "baseline",
        "--label",
        "before",
        "--samples",
        "3",
      ]),
    ).toMatchObject({ command: "baseline", label: "before", samples: 3 });
    expect(
      parseConversationBenchmarkArgs([
        "candidate",
        "--baseline",
        "before.json",
      ]),
    ).toMatchObject({ command: "candidate", baselinePath: "before.json" });
    expect(
      parseConversationBenchmarkArgs([
        "compare",
        "--baseline",
        "before.json",
        "--candidate",
        "after.json",
        "--judge",
      ]),
    ).toMatchObject({ command: "compare", judge: true });
  });

  it("rejects unsafe or incomplete commands", () => {
    expect(() => parseConversationBenchmarkArgs([])).toThrow(/command/);
    expect(() =>
      parseConversationBenchmarkArgs([
        "baseline",
        "--label",
        "x",
        "--samples",
        "0",
      ]),
    ).toThrow(/samples/);
    expect(() => parseConversationBenchmarkArgs(["candidate"])).toThrow(
      /baseline/,
    );
    expect(() =>
      parseConversationBenchmarkArgs([
        "compare",
        "--baseline",
        "a",
        "--candidate",
        "b",
      ]),
    ).toThrow(/judge/);
    expect(() =>
      parseConversationBenchmarkArgs([
        "baseline",
        "--label",
        "x",
        "--model",
        "other",
      ]),
    ).toThrow(/Unknown/);
  });

  it("requires mutation approval only for generation commands", () => {
    expect(() =>
      assertConversationDbMutationAllowed(
        parseConversationBenchmarkArgs(["baseline", "--label", "x"]),
        {},
      ),
    ).toThrow(/approval/);
    expect(() =>
      assertConversationDbMutationAllowed(
        parseConversationBenchmarkArgs([
          "compare",
          "--baseline",
          "a",
          "--candidate",
          "b",
          "--judge",
        ]),
        {},
      ),
    ).not.toThrow();
  });
});
