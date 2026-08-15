import { describe, expect, it } from "vitest";
import { arbitrateTurn } from "./turn-arbitration";

function input(overrides: Partial<Parameters<typeof arbitrateTurn>[0]> = {}) {
  return {
    userMessage: "Rendilo più breve",
    plannerMode: "agentic" as const,
    isGuest: false,
    memoryEnabled: true,
    voiceAllowed: false,
    responseMode: "text" as const,
    explicitWebRule: "allowed" as const,
    hasPendingMemoryApproval: false,
    ...overrides,
  };
}

describe("turn arbitration", () => {
  it("returns one immutable capability decision and no execution profile", async () => {
    const result = await arbitrateTurn(input());

    expect(Object.keys(result)).toEqual(["decision"]);
    expect(result.decision.capabilities.source).toBe("rule");
    expect(result.decision.capabilities.reasonCodes).toContain(
      "deterministic_policy",
    );
    expect(result).not.toHaveProperty("classificationLatencyMs");
    expect(result.decision).not.toHaveProperty("execution");
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.capabilities.reasonCodes)).toBe(
      true,
    );
  });

  it("keeps required web access as an authorized capability", async () => {
    const result = await arbitrateTurn(
      input({
        userMessage: "Qual è il risultato della partita di oggi del Milan?",
        explicitWebRule: "required",
      }),
    );

    expect(result.decision.capabilities).toMatchObject({
      webSearch: true,
      source: "rule",
    });
  });

  it("keeps memory writes deterministic and guest memory closed", async () => {
    const authenticated = await arbitrateTurn(
      input({ userMessage: "Ricordati che mi alleno a tennis il martedì" }),
    );
    expect(authenticated.decision.capabilities.memoryWrite).toBe(true);

    const guest = await arbitrateTurn(
      input({
        isGuest: true,
        userMessage: "Ricordati che mi alleno a tennis il martedì",
      }),
    );
    expect(guest.decision.capabilities).toMatchObject({
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      userContext: false,
    });
  });

  it("never calls or waits for a live classifier", async () => {
    const result = await arbitrateTurn(
      input({ userMessage: "Aiutami a capire cosa dovrei fare adesso" }),
    );

    expect(result.decision.capabilities.source).toBe("rule");
    expect(result.decision).not.toHaveProperty("classifierModel");
    expect(result.decision).not.toHaveProperty("classifierProvider");
  });

  it("propagates cancellation before making the decision", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("request cancelled", "AbortError");
    controller.abort(abortError);

    await expect(
      arbitrateTurn(input({ abortSignal: controller.signal })),
    ).rejects.toBe(abortError);
  });
});
