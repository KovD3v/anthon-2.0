import { describe, expect, it } from "vitest";
import {
  type RoutineProposalV2,
  routineProposalV2Schema,
} from "@/lib/coaching/routine";
import { ORGANIZATION_MODEL_TIERS } from "@/lib/organizations/types";
import { createRoutineProposalTool } from "./tools/routine-proposal";

const proposal = {
  formatVersion: 2,
  title: "Reset pre-gara",
  trigger: "Quando sento salire la pressione prima della partita",
  durationLabel: "90 secondi",
  steps: [
    {
      id: "breath-reset",
      kind: "breathing" as const,
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
      kind: "timer" as const,
      label: "Focus",
      instruction: "Ripeti la parola chiave e guarda il primo gesto.",
      durationSeconds: 30,
    },
    {
      id: "first-gesture",
      kind: "instruction" as const,
      text: "Scegli il primo gesto semplice e riparti da lì.",
    },
    {
      id: "completion",
      kind: "form" as const,
      question: "Quanto ti è stata utile questa routine?",
      mode: "choice" as const,
      options: [
        { label: "Molto", outcome: "HELPFUL" as const },
        { label: "In parte", outcome: "PARTIALLY_HELPFUL" as const },
        { label: "Per nulla", outcome: "NOT_HELPFUL" as const },
      ],
      noteEnabled: true,
    },
  ],
  completionCue: "Inizio il primo punto con presenza.",
} satisfies RoutineProposalV2;

describe("interactive routine model contract", () => {
  it.each(["guest", ...ORGANIZATION_MODEL_TIERS])(
    "exposes the same v2-only routine input contract for %s turns",
    async () => {
      const tool = createRoutineProposalTool().proposeRoutine;

      expect(tool.inputSchema).toBe(routineProposalV2Schema);
      expect(routineProposalV2Schema.safeParse(proposal).success).toBe(true);
      expect(
        routineProposalV2Schema.safeParse({
          ...proposal,
          formatVersion: 1,
        }).success,
      ).toBe(false);
      await expect(tool.execute(proposal, {} as never)).resolves.toEqual({
        proposal,
      });
    },
  );
});
