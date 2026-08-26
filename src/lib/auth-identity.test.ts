import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookies: vi.fn(),
  unstableRethrow: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstableRethrow,
}));

import { resolveAuthenticatedClerkId } from "./auth-identity";
import { createE2ESessionValue, E2E_SESSION_COOKIE_NAME } from "./e2e-runtime";

const enabledEnv = {
  NODE_ENV: "development",
  E2E_EPHEMERAL_BRANCH_ID: "br-routine-e2e",
  E2E_AUTH_SECRET: "a-secret-with-at-least-32-characters",
} as NodeJS.ProcessEnv;

describe("authenticated identity resolver", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", enabledEnv.NODE_ENV);
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", enabledEnv.E2E_EPHEMERAL_BRANCH_ID);
    vi.stubEnv("E2E_AUTH_SECRET", enabledEnv.E2E_AUTH_SECRET);
    mocks.auth.mockReset().mockResolvedValue({ userId: "clerk-user" });
    mocks.cookies.mockReset();
    mocks.unstableRethrow.mockReset().mockImplementation((error: unknown) => {
      if (
        (error as Error & { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
      ) {
        throw error;
      }
    });
  });

  it("prefers a valid signed E2E cookie without calling Clerk", async () => {
    const value = createE2ESessionValue("e2e-user", enabledEnv);
    const request = new Request("http://localhost/api/chat", {
      headers: {
        cookie: `${E2E_SESSION_COOKIE_NAME}=${value}`,
      },
    });

    await expect(resolveAuthenticatedClerkId(request)).resolves.toBe(
      "e2e-user",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("falls back to Clerk for a missing or invalid request cookie", async () => {
    const request = new Request("http://localhost/api/chat", {
      headers: {
        cookie: `${E2E_SESSION_COOKIE_NAME}=tampered`,
      },
    });

    await expect(resolveAuthenticatedClerkId(request)).resolves.toBe(
      "clerk-user",
    );
    expect(mocks.auth).toHaveBeenCalledOnce();
  });

  it("reads the signed cookie for server components without a Request", async () => {
    const value = createE2ESessionValue("e2e-server-user", enabledEnv);
    mocks.cookies.mockResolvedValue({
      get: (name: string) =>
        name === E2E_SESSION_COOKIE_NAME ? { value } : undefined,
    });

    await expect(resolveAuthenticatedClerkId()).resolves.toBe(
      "e2e-server-user",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("does not swallow Next.js prerender interruptions", async () => {
    const dynamicAccess = Object.assign(new Error("dynamic access"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    mocks.cookies.mockRejectedValue(dynamicAccess);

    await expect(resolveAuthenticatedClerkId()).rejects.toBe(dynamicAccess);
    expect(mocks.unstableRethrow).toHaveBeenCalledWith(dynamicAccess);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
