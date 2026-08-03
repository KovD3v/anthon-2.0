import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_CONTINUATION,
  getSafeAuthContinuation,
} from "./auth-continuation";

describe("getSafeAuthContinuation", () => {
  it.each([
    "/chat",
    "/chat/chat_123",
    "/profile",
    "/settings",
    "/admin?page=2",
    "/channels",
    "/organization",
    "/link/telegram/token-123",
    "/link/whatsapp/token_456?source=app",
  ])("accepts an allowed internal destination: %s", (value) => {
    expect(getSafeAuthContinuation(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    "",
    ["/chat", "/admin"],
    "https://evil.example/chat",
    "//evil.example/chat",
    "/\\evil",
    "/%5Cevil",
    "/%2F%2Fevil.example/chat",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/api/user/me",
    "/_next/static/chunk.js",
    "/pricing",
    "/profile/security",
    "/settings/notifications",
    "/admin/users",
    "/channels/telegram",
    "/organization/members",
    "/link/telegram",
    "/chat#session",
  ])("rejects an unsafe or unsupported destination: %j", (value) => {
    expect(getSafeAuthContinuation(value)).toBe(DEFAULT_AUTH_CONTINUATION);
  });
});
