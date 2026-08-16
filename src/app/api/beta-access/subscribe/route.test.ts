import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@/lib/beta-access/abuse", () => ({
  reserveBetaAction: mocks.reserve,
  BetaAbuseDeniedError: class BetaAbuseDeniedError extends Error {
    status = 429;
    reason = "limit_reached";
  },
}));

vi.mock("@/lib/beta-access/subscribers", () => ({
  subscribeToBetaMailing: mocks.subscribe,
}));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/beta-access/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/beta-access/subscribe", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.reserve.mockResolvedValue({});
    mocks.subscribe.mockResolvedValue({ success: true });
  });

  it("returns the same neutral success for inserts and updates", async () => {
    const response = await POST(
      request({
        email: "person@example.com",
        releaseConsent: true,
        updatesConsent: false,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Iscrizione registrata.",
    });
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.any(Request),
      "MAILING_SUBSCRIPTION",
    );
  });

  it("returns field-safe validation errors", async () => {
    let validationError: unknown;
    try {
      z.string().email().parse("bad");
    } catch (error) {
      validationError = error;
    }
    mocks.subscribe.mockRejectedValue(validationError);

    const response = await POST(
      request({
        email: "bad",
        releaseConsent: true,
        updatesConsent: false,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Controlla email e consensi.",
    });
  });

  it("returns 429 when the submission limit is reached", async () => {
    const { BetaAbuseDeniedError } = await import("@/lib/beta-access/abuse");
    mocks.reserve.mockRejectedValue(new BetaAbuseDeniedError());

    const response = await POST(
      request({
        email: "person@example.com",
        releaseConsent: true,
        updatesConsent: false,
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
