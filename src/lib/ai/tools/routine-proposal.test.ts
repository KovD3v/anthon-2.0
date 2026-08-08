import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  routine: { create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { createRoutineProposalTool } from "./routine-proposal";

describe("createRoutineProposalTool", () => {
  it("returns the validated proposal without creating a routine", async () => {
    const proposal = {
      title: "Reset pre-gara",
      trigger: "Quando sento salire la pressione prima della partita",
      durationLabel: "2 minuti",
      steps: ["Fai tre respiri lenti.", "Richiama una parola chiave."],
      completionCue: "Inizio il primo punto con presenza.",
    };

    const result = await createRoutineProposalTool().proposeRoutine.execute(
      proposal,
      {} as never,
    );

    expect(result).toEqual({ proposal });
    expect(prismaMock.routine.create).not.toHaveBeenCalled();
  });
});
