import { describe, expect, it } from "vitest";
import { isProtectedRoute } from "./protected-routes";

describe("isProtectedRoute", () => {
  it.each([
    "/profile",
    "/profile/",
    "/profile/preferences",
    "/settings/account",
    "/admin",
    "/admin/users",
    "/channels",
    "/channels/telegram",
    "/organization",
    "/organization/members",
    "/organizzation",
  ])("protects %s", (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/chat",
    "/profiled",
    "/administered",
    "/channels-public",
    "/organization-public",
    "/api/admin/users",
  ])("does not protect %s", (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(false);
  });
});
