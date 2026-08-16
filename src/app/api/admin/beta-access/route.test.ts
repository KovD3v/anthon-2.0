import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  loadConfig: vi.fn(),
  rotate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));

vi.mock("@/lib/beta-access/service", () => ({
  loadBetaAccessConfig: mocks.loadConfig,
  rotateBetaAccessPassword: mocks.rotate,
}));

import { GET, PATCH } from "./route";

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/beta-access", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/beta-access", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "SUPER_ADMIN" },
      errorResponse: null,
    });
    mocks.loadConfig.mockResolvedValue({ active: false });
  });

  it("protects both reads and rotations with SUPER_ADMIN", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireSuperAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    expect((await GET()).status).toBe(403);
    expect(
      (await PATCH(patchRequest({ password: "a", confirmation: "a" }))).status,
    ).toBe(403);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("returns only safe inactive or active status fields", async () => {
    await expect((await GET()).json()).resolves.toEqual({ active: false });

    mocks.loadConfig.mockResolvedValue({
      active: true,
      accessVersion: 3,
      passwordDigest: "must-not-leak",
      activatedAt: new Date("2026-08-16T10:00:00.000Z"),
      rotatedAt: new Date("2026-08-16T11:00:00.000Z"),
    });
    const active = await GET();
    const activeCopy = active.clone();
    await expect(active.json()).resolves.toEqual({
      active: true,
      accessVersion: 3,
      activatedAt: "2026-08-16T10:00:00.000Z",
      rotatedAt: "2026-08-16T11:00:00.000Z",
    });
    expect(await activeCopy.text()).not.toContain("must-not-leak");
  });

  it("validates strength and confirmation before rotation", async () => {
    const weak = await PATCH(
      patchRequest({ password: "short", confirmation: "short" }),
    );
    expect(weak.status).toBe(400);

    const mismatch = await PATCH(
      patchRequest({
        password: "a long beta password",
        confirmation: "another long password",
      }),
    );
    expect(mismatch.status).toBe(400);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("rotates the shared password with the authorized actor", async () => {
    mocks.rotate.mockResolvedValue({
      active: true,
      accessVersion: 2,
      activatedAt: new Date("2026-08-16T10:00:00.000Z"),
      rotatedAt: new Date("2026-08-16T11:00:00.000Z"),
    });

    const response = await PATCH(
      patchRequest({
        password: "a long beta password",
        confirmation: "a long beta password",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rotate).toHaveBeenCalledWith(
      "a long beta password",
      "admin-1",
    );
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });
});
