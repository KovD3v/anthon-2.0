import { describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentParent,
  buildChildProcessEnv,
  buildE2EProcessEnv,
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

  it("refuses a missing or mismatched development parent", () => {
    expect(() => assertDevelopmentParent(undefined, "br-dev")).toThrow(
      "was not found",
    );
    expect(() =>
      assertDevelopmentParent(
        { id: "br-other", name: "development" },
        "br-dev",
      ),
    ).toThrow("was not found");
    expect(() =>
      assertDevelopmentParent(
        { id: "br-main", name: "main", primary: true },
        "br-main",
      ),
    ).toThrow("DATABASE_URL must point to development");
  });

  it("rejects a database URL that is not a Neon endpoint", () => {
    expect(() =>
      getEndpointId("postgresql://user:secret@localhost:5432/db"),
    ).toThrow("DATABASE_URL must point to a Neon endpoint");
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

  it("lists project endpoints and branches with authenticated GET requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            endpoints: [
              {
                id: "ep-dev",
                branch_id: "br-dev",
                host: "ep-dev.neon.tech",
                type: "read_write",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [{ id: "br-dev", name: "development" }],
          }),
        ),
      ) as typeof fetch;
    const api = new NeonBranchApi("secret-key", "project-id", fetcher);

    await expect(api.listEndpoints()).resolves.toHaveLength(1);
    await expect(api.listBranches()).resolves.toEqual([
      { id: "br-dev", name: "development" },
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/projects/project-id/endpoints"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer secret-key",
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/projects/project-id/branches"),
      expect.any(Object),
    );
  });

  it("reports Neon API failures without including response content", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("provider details", {
        status: 503,
        statusText: "Unavailable",
      }),
    ) as typeof fetch;
    const api = new NeonBranchApi("secret-key", "project-id", fetcher);

    await expect(api.deleteBranch("br-test")).rejects.toThrow(
      "Neon API request failed (DELETE /branches/br-test, 503 Unavailable)",
    );
  });

  it("uses bounded, collision-resistant branch names", () => {
    const name = buildEphemeralBranchName(new Date("2026-07-13T17:30:45.000Z"));
    expect(name).toMatch(/^integration-20260713173045-[a-f0-9]{8}$/);
    expect(name.length).toBeLessThan(64);
    expect(
      buildEphemeralBranchName(new Date("2026-07-13T17:30:45.000Z"), "e2e"),
    ).toMatch(/^e2e-20260713173045-[a-f0-9]{8}$/);
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
        E2E_EPHEMERAL_BRANCH_ID: "br-stale-e2e",
        E2E_AUTH_SECRET: "stale-secret",
        E2E_AUTH_CLERK_ID: "stale-user",
      }),
    ).toEqual({
      NODE_ENV: "test",
      DATABASE_URL: "development-url",
      NEON_PROJECT_ID: "project-id",
    });
  });

  it("raises the guest creation cap only inside the isolated E2E process", () => {
    const env = buildE2EProcessEnv({
      childProcessEnv: {
        NODE_ENV: "test",
        GUEST_CREATIONS_PER_IP_PER_DAY: "3",
      },
      testDatabaseUrl: "ephemeral-url",
      branchId: "br-e2e",
    });

    expect(env).toMatchObject({
      DATABASE_URL: "ephemeral-url",
      DIRECT_DATABASE_URL: "ephemeral-url",
      E2E_EPHEMERAL_BRANCH_ID: "br-e2e",
      E2E_AUTH_CLERK_ID: "e2e-playwright-user",
      E2E_AUTH_SECRET: expect.stringMatching(/^[a-f0-9]{64}$/),
      GUEST_CREATIONS_PER_IP_PER_DAY: "100",
    });
  });

  it("configures the isolated instant-navigation production rig", () => {
    const env = buildE2EProcessEnv({
      childProcessEnv: {
        NODE_ENV: "test",
        INSTANT_NAV_RIG: "1",
      },
      testDatabaseUrl: "ephemeral-url",
      branchId: "br-e2e",
    });

    expect(env).toMatchObject({
      NEXT_PUBLIC_APP_URL: "http://localhost:3200",
      TRUST_PROXY_HEADERS: "true",
    });
  });
});
