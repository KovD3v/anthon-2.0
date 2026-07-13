import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, getFeatureFlag } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getFeatureFlag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { modelExperiment: { findFirst } },
}));
vi.mock("@/lib/posthog", () => ({
  getPostHogClient: () => ({ getFeatureFlag }),
}));

import type { TurnPlan } from "@/lib/ai/turn-plan";
import {
  checkStaticModelComparisonEligibility,
  getEligibleModelExperiment,
  isCheaplySafeModelComparisonMessage,
  isParticipantCadenceEligible,
  isSafeModelComparisonTurn,
} from "./eligibility";

const safeTurn: TurnPlan = {
  version: 2,
  promptProfile: "full",
  responseLength: "normal",
  inputOrigin: "text",
  outputMode: "text",
  history: {
    scope: "thread",
    includeSummary: true,
    maxRawTurns: 8,
    maxRawChars: 20_000,
  },
  capabilities: {
    webSearch: false,
    webFetch: false,
    rag: true,
    userContext: true,
    memoryRead: true,
    memoryWrite: false,
    profileWrite: false,
    preferenceWrite: false,
    notesWrite: false,
  },
  source: "rule",
  reasonCodes: [],
};

describe("model comparison eligibility", () => {
  beforeEach(() => {
    findFirst.mockReset();
    getFeatureFlag.mockReset();
  });

  it("admits only registered Italian non-admin web text users", () => {
    const eligible = {
      countryCode: "IT",
      channel: "WEB",
      clerkId: "user_1",
      isGuest: false,
      role: "USER",
      hasAttachments: false,
      responseMode: "text" as const,
    };
    expect(checkStaticModelComparisonEligibility(eligible)).toBe(true);
    expect(
      checkStaticModelComparisonEligibility({ ...eligible, countryCode: "FR" }),
    ).toBe(false);
    expect(
      checkStaticModelComparisonEligibility({ ...eligible, role: "ADMIN" }),
    ).toBe(false);
    expect(
      checkStaticModelComparisonEligibility({
        ...eligible,
        hasAttachments: true,
      }),
    ).toBe(false);
  });

  it("rejects unsafe capabilities and explicit voice requests", () => {
    expect(isCheaplySafeModelComparisonMessage("Aiutami a concentrarmi")).toBe(
      true,
    );
    expect(isCheaplySafeModelComparisonMessage("Ricordati questa cosa")).toBe(
      false,
    );
    expect(
      isCheaplySafeModelComparisonMessage("Cerca le notizie di oggi"),
    ).toBe(false);
    expect(isSafeModelComparisonTurn(safeTurn, "Aiutami a concentrarmi")).toBe(
      true,
    );
    expect(
      isSafeModelComparisonTurn(
        {
          ...safeTurn,
          capabilities: { ...safeTurn.capabilities, webSearch: true },
        },
        "Cerca il risultato",
      ),
    ).toBe(false);
    expect(isSafeModelComparisonTurn(safeTurn, "dimmelo a voce")).toBe(false);
  });

  it("enforces rolling cooldown and attempt cap", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    expect(isParticipantCadenceEligible(undefined, 5, now)).toBe(true);
    expect(
      isParticipantCadenceEligible(
        { attempts: 5, nextEligibleAt: null },
        5,
        now,
      ),
    ).toBe(false);
    expect(
      isParticipantCadenceEligible(
        { attempts: 2, nextEligibleAt: new Date("2026-07-14T12:00:00Z") },
        5,
        now,
      ),
    ).toBe(false);
  });

  it("fails closed when PostHog evaluation fails", async () => {
    findFirst.mockResolvedValue({
      id: "exp_1",
      perUserCap: 5,
      posthogFlagKey: "flag",
      variants: [{ role: "CONTROL" }, { role: "CANDIDATE" }],
      participants: [],
    });
    getFeatureFlag.mockRejectedValue(new Error("network"));
    await expect(
      getEligibleModelExperiment({
        userId: "db_1",
        clerkId: "clerk_1",
        countryCode: "IT",
      }),
    ).resolves.toBeNull();
  });
});
