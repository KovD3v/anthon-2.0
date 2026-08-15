import { describe, expect, it } from "vitest";
import { isFastPathEnabled } from "./fast-path-config";

describe("fast path configuration", () => {
  it.each([
    [undefined, true],
    ["true", true],
    ["false", false],
    ["FALSE", false],
    ["invalid", false],
  ] as const)("parses AI_FAST_PATH_ENABLED=%s as %s", (value, expected) => {
    expect(
      isFastPathEnabled(
        value === undefined ? {} : { AI_FAST_PATH_ENABLED: value },
      ),
    ).toBe(expected);
  });
});
