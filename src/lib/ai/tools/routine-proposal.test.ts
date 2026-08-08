import { describe, expect, it, vi } from "vitest";
import {
  type RoutineProposalV2,
  routineProposalV2Schema,
} from "@/lib/coaching/routine";

const prismaMock = vi.hoisted(() => ({
  routine: { create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { createRoutineProposalTool } from "./routine-proposal";

describe("createRoutineProposalTool", () => {
  it("accepts only the v2 widget contract and never persists the proposal", async () => {
    const proposal = {
      formatVersion: 2,
      title: "Reset pre-gara",
      trigger: "Quando sento salire la pressione prima della partita",
      durationLabel: "2 minuti",
      steps: [
        {
          id: "breath-reset",
          kind: "breathing",
          label: "Respiro",
          instruction: "Segui un respiro lento e regolare.",
          inhaleSeconds: 3,
          exhaleSeconds: 5,
          holdAfterInhaleSeconds: 0,
          holdAfterExhaleSeconds: 0,
          cycles: 3,
        },
        {
          id: "focus-timer",
          kind: "timer",
          label: "Focus",
          instruction: "Ripeti la parola chiave e guarda il primo gesto.",
          durationSeconds: 30,
        },
        {
          id: "first-gesture",
          kind: "instruction",
          text: "Scegli il primo gesto semplice e riparti da lì.",
        },
        {
          id: "completion",
          kind: "form",
          question: "Quanto ti è stata utile questa routine?",
          mode: "choice",
          options: [
            { label: "Molto", outcome: "HELPFUL" },
            { label: "In parte", outcome: "PARTIALLY_HELPFUL" },
            { label: "Per nulla", outcome: "NOT_HELPFUL" },
          ],
          noteEnabled: true,
        },
      ],
      completionCue: "Inizio il primo punto con presenza.",
    } satisfies RoutineProposalV2;
    const tool = createRoutineProposalTool().proposeRoutine;

    expect(tool.inputSchema).toBe(routineProposalV2Schema);
    expect(
      routineProposalV2Schema.safeParse({
        title: "Reset pre-gara",
        trigger: "Quando sento salire la pressione prima della partita",
        steps: ["Fai tre respiri lenti.", "Richiama una parola chiave."],
        completionCue: "Inizio il primo punto con presenza.",
      }).success,
    ).toBe(false);
    expect(routineProposalV2Schema.safeParse(proposal).success).toBe(true);

    const result = await tool.execute(proposal, {} as never);

    expect(result).toEqual({ proposal });
    expect(prismaMock.routine.create).not.toHaveBeenCalled();
  });
});
