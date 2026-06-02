import { describe, expect, it } from "vitest";
import dataset from "./dataset.json";

describe("benchmark/dataset", () => {
  it("contains a unique, product-focused 24 case set", () => {
    expect(dataset.metadata.version).toBe("2.0");
    expect(dataset.testCases).toHaveLength(24);

    const ids = dataset.testCases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(
      dataset.testCases.filter(
        (testCase) => testCase.category === "tool_usage",
      ),
    ).toHaveLength(12);
    expect(
      dataset.testCases.filter(
        (testCase) => testCase.category === "writing_quality",
      ),
    ).toHaveLength(12);
  });

  it("uses only benchmark categories supported by the seed script", () => {
    expect(
      dataset.testCases.every((testCase) =>
        ["tool_usage", "writing_quality"].includes(testCase.category),
      ),
    ).toBe(true);
  });
});
