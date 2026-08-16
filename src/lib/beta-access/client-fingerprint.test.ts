import { afterEach, describe, expect, it, vi } from "vitest";
import { getBetaClientFingerprint } from "./client-fingerprint";

describe("beta client fingerprint", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hashes a Vercel client address with action domain separation", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BETA_ACCESS_COOKIE_SECRET", "a".repeat(32));
    const request = new Request("https://anthon.ai/beta-access", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });

    const unlock = getBetaClientFingerprint(request, "UNLOCK");
    const mailing = getBetaClientFingerprint(request, "MAILING_SUBSCRIPTION");

    expect(unlock).toMatch(/^[a-f0-9]{64}$/);
    expect(unlock).not.toContain("203.0.113.8");
    expect(mailing).not.toBe(unlock);
  });

  it("does not trust forwarding headers outside explicit proxy contexts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    vi.stubEnv("BETA_ACCESS_COOKIE_SECRET", "a".repeat(32));
    const request = new Request("https://anthon.ai/beta-access", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });

    expect(getBetaClientFingerprint(request, "UNLOCK")).toBeNull();
  });

  it("rejects forwarded lists on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BETA_ACCESS_COOKIE_SECRET", "a".repeat(32));
    const request = new Request("https://anthon.ai/beta-access", {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
    });

    expect(getBetaClientFingerprint(request, "UNLOCK")).toBeNull();
  });
});
