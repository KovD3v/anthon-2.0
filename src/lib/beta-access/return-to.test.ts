import { describe, expect, it } from "vitest";
import { sanitizeBetaReturnTo } from "./return-to";

describe("sanitizeBetaReturnTo", () => {
  it.each([
    ["/chat", "/chat"],
    ["/chat/abc?mode=focus", "/chat/abc?mode=focus"],
    ["/profile#security", "/profile#security"],
  ])("keeps safe internal destination %s", (input, expected) => {
    expect(sanitizeBetaReturnTo(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "https://evil.example/chat",
    "//evil.example/chat",
    "javascript:alert(1)",
    "/beta-access",
    "/admin",
    "/admin/users",
    "/api/health",
    "/api/webhooks/clerk",
  ])("falls back to home for unsafe destination %j", (input) => {
    expect(sanitizeBetaReturnTo(input)).toBe("/");
  });
});
