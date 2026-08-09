import { tool } from "ai";
import {
  type RoutineProposalV2,
  routineProposalV2Schema,
} from "@/lib/coaching/routine";

export type RoutineProposalToolResult = {
  proposal: RoutineProposalV2 | null;
};

export function createRoutineProposalTool() {
  let proposalCreated = false;

  return {
    proposeRoutine: tool({
      description:
        "Proponi una routine interattiva nel solo formato v2 validato. Ogni passo ha un id stabile e un kind instruction, timer, breathing oppure form. Il form opzionale e terminale usa le tre outcome canoniche HELPFUL, PARTIALLY_HELPFUL e NOT_HELPFUL. I limiti di durata, cicli, testo e passi sono applicati dal server. Non salva nulla.",
      inputSchema: routineProposalV2Schema,
      execute: async (proposal): Promise<RoutineProposalToolResult> => {
        if (proposalCreated) {
          return { proposal: null };
        }

        proposalCreated = true;
        return { proposal };
      },
    }),
  };
}
