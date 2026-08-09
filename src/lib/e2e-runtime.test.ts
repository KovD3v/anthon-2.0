import { describe, expect, it } from "vitest";
import {
  createE2ESessionValue,
  isE2ERuntimeEnabled,
  verifyE2ESessionValue,
} from "./e2e-runtime";

const enabledEnv = {
  NODE_ENV: "development",
  E2E_EPHEMERAL_BRANCH_ID: "br-routine-e2e",
  E2E_AUTH_SECRET: "a-secret-with-at-least-32-characters",
} as NodeJS.ProcessEnv;

describe("isolated E2E runtime", () => {
  it("enables the fixture only on a development ephemeral branch", () => {
    expect(isE2ERuntimeEnabled(enabledEnv)).toBe(true);
    expect(isE2ERuntimeEnabled({ ...enabledEnv, NODE_ENV: "production" })).toBe(
      false,
    );
    expect(
      isE2ERuntimeEnabled({
        ...enabledEnv,
        E2E_EPHEMERAL_BRANCH_ID: "development",
      }),
    ).toBe(false);
    expect(
      isE2ERuntimeEnabled({ ...enabledEnv, E2E_AUTH_SECRET: "too-short" }),
    ).toBe(false);
  });

  it("signs a session and rejects tampering or a different secret", () => {
    const value = createE2ESessionValue("e2e-routine-user", enabledEnv);

    expect(verifyE2ESessionValue(value, enabledEnv)).toBe("e2e-routine-user");
    expect(verifyE2ESessionValue(`${value}x`, enabledEnv)).toBeNull();
    expect(
      verifyE2ESessionValue(value, {
        ...enabledEnv,
        E2E_AUTH_SECRET: "different-secret-with-32-characters",
      }),
    ).toBeNull();
  });

  it("fails closed when asked to create a session outside the guard", () => {
    expect(() =>
      createE2ESessionValue("e2e-routine-user", {
        ...enabledEnv,
        NODE_ENV: "production",
      }),
    ).toThrow("E2E runtime is not enabled");
    expect(verifyE2ESessionValue("not-a-session", { NODE_ENV: "test" })).toBe(
      null,
    );
  });
});
