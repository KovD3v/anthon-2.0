import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIVACY_URL,
  DEFAULT_TERMS_URL,
  resolveLegalUrl,
} from "./legal-links";

describe("resolveLegalUrl", () => {
  it("keeps valid HTTPS legal URLs", () => {
    expect(
      resolveLegalUrl("https://legal.anthon.ai/terms", DEFAULT_TERMS_URL),
    ).toBe("https://legal.anthon.ai/terms");
  });

  it("falls back for malformed and insecure production URLs", () => {
    expect(resolveLegalUrl("not a url", DEFAULT_TERMS_URL)).toBe(
      DEFAULT_TERMS_URL,
    );
    expect(
      resolveLegalUrl(
        "http://anthon.ai/privacy",
        DEFAULT_PRIVACY_URL,
        "production",
      ),
    ).toBe(DEFAULT_PRIVACY_URL);
  });

  it("allows localhost HTTP outside production", () => {
    expect(
      resolveLegalUrl(
        "http://localhost:3000/terms",
        DEFAULT_TERMS_URL,
        "development",
      ),
    ).toBe("http://localhost:3000/terms");
  });
});
