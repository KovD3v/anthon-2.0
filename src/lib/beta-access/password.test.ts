import { describe, expect, it } from "vitest";
import { hashBetaPassword, verifyBetaPassword } from "./password";

describe("beta access password", () => {
  it("creates a versioned scrypt digest that verifies only the original password", async () => {
    const digest = await hashBetaPassword("correct horse battery staple");

    expect(digest).toMatch(
      /^scrypt\$v1\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    await expect(
      verifyBetaPassword("correct horse battery staple", digest),
    ).resolves.toBe(true);
    await expect(verifyBetaPassword("wrong password", digest)).resolves.toBe(
      false,
    );
  });

  it("uses a fresh salt while keeping fixed-size salt and digest fields", async () => {
    const first = await hashBetaPassword("same password");
    const second = await hashBetaPassword("same password");
    const firstFields = first.split("$");
    const secondFields = second.split("$");

    expect(first).not.toBe(second);
    expect(firstFields[5]).not.toBe(secondFields[5]);
    expect(firstFields[5]?.length).toBe(secondFields[5]?.length);
    expect(firstFields[6]?.length).toBe(secondFields[6]?.length);
  });

  it.each([
    "",
    "plain-text",
    "scrypt$v2$16384$8$1$salt$digest",
    "scrypt$v1$NaN$8$1$salt$digest",
    "scrypt$v1$16384$8$1$not+base64$digest",
    "scrypt$v1$16384$8$1$c2FsdA$short",
  ])("rejects malformed serialized digest %j", async (digest) => {
    await expect(verifyBetaPassword("password", digest)).resolves.toBe(false);
  });
});
