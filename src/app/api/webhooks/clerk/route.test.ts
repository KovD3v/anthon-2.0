import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  webhookVerify: vi.fn(),
  handleUserCreated: vi.fn(),
  handleUserUpdated: vi.fn(),
  handleSubscriptionCreated: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
  handleOrganizationUpsert: vi.fn(),
  handleOrganizationDeleted: vi.fn(),
  handleOrganizationMembershipUpsert: vi.fn(),
  handleOrganizationMembershipDeleted: vi.fn(),
  handleOrganizationInvitationAccepted: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify = mocks.webhookVerify;
  },
}));

vi.mock("./handlers/user", () => ({
  handleUserCreated: mocks.handleUserCreated,
  handleUserUpdated: mocks.handleUserUpdated,
}));

vi.mock("./handlers/subscription", () => ({
  handleSubscriptionCreated: mocks.handleSubscriptionCreated,
  handleSubscriptionUpdated: mocks.handleSubscriptionUpdated,
  handleSubscriptionDeleted: mocks.handleSubscriptionDeleted,
}));

vi.mock("./handlers/organization", () => ({
  handleOrganizationUpsert: mocks.handleOrganizationUpsert,
  handleOrganizationDeleted: mocks.handleOrganizationDeleted,
  handleOrganizationMembershipUpsert: mocks.handleOrganizationMembershipUpsert,
  handleOrganizationMembershipDeleted: mocks.handleOrganizationMembershipDeleted,
  handleOrganizationInvitationAccepted:
    mocks.handleOrganizationInvitationAccepted,
}));

import { POST } from "./route";

const originalEnv = { ...process.env };

function setSvixHeaders(values?: Partial<Record<string, string>>) {
  const resolved = {
    "svix-id": values?.["svix-id"] ?? "id-1",
    "svix-timestamp": values?.["svix-timestamp"] ?? "1700000000",
    "svix-signature": values?.["svix-signature"] ?? "sig",
  };

  mocks.headers.mockResolvedValue({
    get: (key: string) => resolved[key] ?? null,
  });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SECRET = "wh-secret";

    mocks.headers.mockReset();
    mocks.webhookVerify.mockReset();
    mocks.handleUserCreated.mockReset();
    mocks.handleUserUpdated.mockReset();
    mocks.handleSubscriptionCreated.mockReset();
    mocks.handleSubscriptionUpdated.mockReset();
    mocks.handleSubscriptionDeleted.mockReset();
    mocks.handleOrganizationUpsert.mockReset();
    mocks.handleOrganizationDeleted.mockReset();
    mocks.handleOrganizationMembershipUpsert.mockReset();
    mocks.handleOrganizationMembershipDeleted.mockReset();
    mocks.handleOrganizationInvitationAccepted.mockReset();

    setSvixHeaders();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 500 when webhook secret is missing", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Webhook secret not configured");
  });

  it("returns 400 when svix headers are missing", async () => {
    setSvixHeaders({ "svix-id": "" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing svix headers");
  });

  it("returns 400 on invalid signature", async () => {
    mocks.webhookVerify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid signature");
  });

  it("dispatches user.created handler", async () => {
    mocks.webhookVerify.mockReturnValue({
      type: "user.created",
      data: { id: "user_1" },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify({ any: "payload" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Webhook processed");
    expect(mocks.handleUserCreated).toHaveBeenCalledWith({ id: "user_1" });
  });

  it("dispatches membership upsert for organization_membership.updated", async () => {
    mocks.webhookVerify.mockReturnValue({
      type: "organization_membership.updated",
      data: { id: "mem_1" },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.handleOrganizationMembershipUpsert).toHaveBeenCalledWith({
      id: "mem_1",
    });
  });

  it("returns 500 when handler throws", async () => {
    mocks.webhookVerify.mockReturnValue({
      type: "subscription.created",
      data: { id: "sub_1" },
    });
    mocks.handleSubscriptionCreated.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Webhook processing error");
  });

  it("returns 200 for unhandled events", async () => {
    mocks.webhookVerify.mockReturnValue({
      type: "session.created",
      data: {},
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Webhook processed");
    expect(mocks.handleUserCreated).not.toHaveBeenCalled();
    expect(mocks.handleSubscriptionCreated).not.toHaveBeenCalled();
  });
});
