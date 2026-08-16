import { describe, expect, it } from "vitest";
import {
  classifyBetaGatePath,
  isAdminAuthBootstrapRequest,
} from "./route-policy";

describe("beta gate route policy", () => {
  it.each([
    "/beta-access",
    "/beta-access/help",
    "/privacy",
    "/terms",
    "/admin",
    "/admin/beta",
    "/api/admin/beta-access",
    "/api/beta-access/unlock",
    "/api/health",
    "/api/webhooks/clerk",
    "/api/webhooks/telegram",
    "/api/cron/cleanup-ai-traces",
    "/api/queues/analyze",
  ])("keeps %s public to the beta gate", (pathname) => {
    expect(classifyBetaGatePath(pathname)).toBe("public");
  });

  it.each([
    "/",
    "/chat",
    "/sign-in",
    "/sign-up",
    "/onboarding",
    "/profile",
    "/channels",
    "/organization",
    "/privacy-policy",
    "/administrator",
  ])("classifies %s as a gated page", (pathname) => {
    expect(classifyBetaGatePath(pathname)).toBe("page");
  });

  it.each([
    "/api/chat",
    "/api/guest/chat",
    "/api/chats/search",
    "/api/preferences",
    "/api/upload",
  ])("classifies %s as a gated browser API", (pathname) => {
    expect(classifyBetaGatePath(pathname)).toBe("api");
  });

  it("allows only safe admin-directed Clerk bootstrap requests", () => {
    expect(
      isAdminAuthBootstrapRequest(
        new URL("https://anthon.ai/sign-in?redirect_url=%2Fadmin%2Fbeta"),
      ),
    ).toBe(true);
    expect(
      isAdminAuthBootstrapRequest(
        new URL("https://anthon.ai/forgot-password?redirect_url=%2Fadmin"),
      ),
    ).toBe(true);
    expect(
      isAdminAuthBootstrapRequest(
        new URL("https://anthon.ai/sign-in?redirect_url=%2Fchat"),
      ),
    ).toBe(false);
    expect(
      isAdminAuthBootstrapRequest(
        new URL("https://anthon.ai/sign-in?redirect_url=https://evil.example"),
      ),
    ).toBe(false);
    expect(
      isAdminAuthBootstrapRequest(
        new URL("https://anthon.ai/chat?redirect_url=%2Fadmin"),
      ),
    ).toBe(false);
  });
});
