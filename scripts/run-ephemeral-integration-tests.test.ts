import { describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentParent,
  buildChildProcessEnv,
  buildEphemeralBranchName,
  buildEphemeralConnectionString,
  getEndpointId,
  NeonBranchApi,
} from "./run-ephemeral-integration-tests";

describe("ephemeral Neon integration runner", () => {
  it("derives the development endpoint from direct and pooled URLs", () => {
    expect(
      getEndpointId(
        "postgresql://user:secret@ep-quiet-pond-pooler.c-2.eu.neon.tech/db",
      ),
    ).toBe("ep-quiet-pond");
    expect(
      getEndpointId(
        "postgresql://user:secret@ep-quiet-pond.c-2.eu.neon.tech/db",
      ),
    ).toBe("ep-quiet-pond");
  });

  it("refuses default, protected, and production parents", () => {
    expect(() =>
      assertDevelopmentParent(
        { id: "br-prod", name: "production", default: true },
        "br-prod",
      ),
    ).toThrow("DATABASE_URL must point to development");
    expect(() =>
      assertDevelopmentParent(
        { id: "br-protected", name: "development", protected: true },
        "br-protected",
      ),
    ).toThrow("DATABASE_URL must point to development");
    expect(() =>
      assertDevelopmentParent(
        { id: "br-staging", name: "staging" },
        "br-staging",
      ),
    ).toThrow("DATABASE_URL must point to development");
    expect(() =>
      assertDevelopmentParent({ id: "br-dev", name: "development" }, "br-dev"),
    ).not.toThrow();
  });

  it("reuses credentials while replacing only the branch endpoint", () => {
    const result = new URL(
      buildEphemeralConnectionString(
        "postgresql://user:secret@ep-dev-pooler.c-2.eu.neon.tech/neondb?sslmode=require&pgbouncer=true",
        "ep-test.c-2.eu.neon.tech",
      ),
    );
    expect(result.hostname).toBe("ep-test.c-2.eu.neon.tech");
    expect(result.username).toBe("user");
    expect(result.password).toBe("secret");
    expect(result.pathname).toBe("/neondb");
    expect(result.searchParams.get("sslmode")).toBe("require");
    expect(result.searchParams.has("pgbouncer")).toBe(false);
  });

  it("creates an expiring child with a read-write compute and deletes it", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({ branch: { id: "br-test" }, endpoints: [] }),
        );
      },
    ) as typeof fetch;
    const api = new NeonBranchApi("secret-key", "project-id", fetcher);
    await api.createBranch({
      name: "integration-run",
      parentId: "br-development",
      expiresAt: new Date("2026-07-13T20:00:00.000Z"),
    });
    await api.deleteBranch("br-test");

    const createBody = JSON.parse(String(requests[0]?.init?.body));
    expect(createBody).toEqual({
      branch: {
        name: "integration-run",
        parent_id: "br-development",
        expires_at: "2026-07-13T20:00:00.000Z",
      },
      endpoints: [{ type: "read_write" }],
    });
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[1]).toMatchObject({
      url: expect.stringContaining("/branches/br-test"),
      init: { method: "DELETE" },
    });
  });

  it("uses bounded, collision-resistant branch names", () => {
    const name = buildEphemeralBranchName(new Date("2026-07-13T17:30:45.000Z"));
    expect(name).toMatch(/^integration-20260713173045-[a-f0-9]{8}$/);
    expect(name.length).toBeLessThan(64);
  });

  it("does not pass Neon management credentials or stale test URLs to children", () => {
    expect(
      buildChildProcessEnv({
        NODE_ENV: "test",
        DATABASE_URL: "development-url",
        NEON_API_KEY: "management-secret",
        NEON_PROJECT_ID: "project-id",
        TEST_DATABASE_URL: "stale-test-url",
        INTEGRATION_EPHEMERAL_BRANCH_ID: "br-stale",
      }),
    ).toEqual({
      NODE_ENV: "test",
      DATABASE_URL: "development-url",
      NEON_PROJECT_ID: "project-id",
    });
  });
});
