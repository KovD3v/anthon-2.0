import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

import { GET, PATCH } from "./route";

describe("integration /api/preferences", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.getAuthUser.mockReset();
  });

  it("GET returns defaults when preferences are missing", async () => {
    const user = await createUser();
    mocks.getAuthUser.mockResolvedValue({
      user: toAuthUser(user),
      error: null,
    });

    const response = await GET();
    const body = (await response.json()) as {
      voiceEnabled: boolean;
      tone: string | null;
      mode: string | null;
      language: string;
      push: boolean;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      voiceEnabled: true,
      tone: null,
      mode: null,
      language: "IT",
      push: true,
    });
  });

  it("PATCH upserts partial values and GET returns persisted result", async () => {
    const user = await createUser();
    mocks.getAuthUser.mockResolvedValue({
      user: toAuthUser(user),
      error: null,
    });

    const patchResponse = await PATCH(
      new Request("http://localhost/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          tone: "direct",
          push: false,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const patchBody = (await patchResponse.json()) as {
      tone: string | null;
      push: boolean | null;
      language: string | null;
      voiceEnabled: boolean | null;
    };

    expect(patchResponse.status).toBe(200);
    expect(patchBody.tone).toBe("direct");
    expect(patchBody.push).toBe(false);
    expect(patchBody.language).toBe("IT");
    expect(patchBody.voiceEnabled).toBe(true);

    const savedPreferences = await prisma.preferences.findUnique({
      where: { userId: user.id },
    });
    expect(savedPreferences?.tone).toBe("direct");
    expect(savedPreferences?.push).toBe(false);

    const getResponse = await GET();
    const getBody = (await getResponse.json()) as {
      tone: string | null;
      push: boolean;
    };
    expect(getResponse.status).toBe(200);
    expect(getBody.tone).toBe("direct");
    expect(getBody.push).toBe(false);
  });
});
