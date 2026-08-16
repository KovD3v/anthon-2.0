import { describe, expect, it } from "vitest";
import {
  BETA_ACCESS_COOKIE_MAX_AGE_SECONDS,
  BETA_ACCESS_COOKIE_NAME,
  betaAccessCookieOptions,
  signBetaAccessCookie,
  verifyBetaAccessCookie,
} from "./cookie";

const secret = "test-cookie-secret-that-is-long-enough";
const now = new Date("2026-08-16T09:00:00.000Z");

describe("beta access cookie", () => {
  it("signs a 180-day access grant with the configuration version", () => {
    const value = signBetaAccessCookie({
      configVersion: 7,
      secret,
      now,
      nonce: "fixed-nonce",
    });

    expect(verifyBetaAccessCookie(value, { secret, now })).toEqual({
      configVersion: 7,
      expiresAt: new Date("2027-02-12T09:00:00.000Z"),
    });
    expect(BETA_ACCESS_COOKIE_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });

  it("rejects tampering and a different signing secret", () => {
    const value = signBetaAccessCookie({
      configVersion: 3,
      secret,
      now,
      nonce: "fixed-nonce",
    });
    const tampered = value.replace(".3.", ".4.");

    expect(verifyBetaAccessCookie(tampered, { secret, now })).toBeNull();
    expect(
      verifyBetaAccessCookie(value, { secret: "another-secret", now }),
    ).toBeNull();
  });

  it("rejects expired and malformed values", () => {
    const value = signBetaAccessCookie({
      configVersion: 1,
      secret,
      now,
      nonce: "fixed-nonce",
    });

    expect(
      verifyBetaAccessCookie(value, {
        secret,
        now: new Date("2027-02-12T09:00:01.000Z"),
      }),
    ).toBeNull();
    expect(verifyBetaAccessCookie("", { secret, now })).toBeNull();
    expect(verifyBetaAccessCookie("v1.bad", { secret, now })).toBeNull();
  });

  it("uses a persistent HttpOnly site-wide cookie", () => {
    expect(BETA_ACCESS_COOKIE_NAME).toBe("anthon_beta_access");
    expect(betaAccessCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: BETA_ACCESS_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      priority: "high",
    });
    expect(betaAccessCookieOptions(false).secure).toBe(false);
  });
});
