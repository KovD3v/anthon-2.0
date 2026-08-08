import { tool } from "ai";
import { routineProposalV2Schema } from "@/lib/coaching/routine";

export function createRoutineProposalTool() {
  return {
    proposeRoutine: tool({
      description:
        "Proponi una routine interattiva nel solo formato v2 validato. Ogni passo ha un id stabile e un kind instruction, timer, breathing oppure form. Il form opzionale e terminale usa le tre outcome canoniche HELPFUL, PARTIALLY_HELPFUL e NOT_HELPFUL. I limiti di durata, cicli, testo e passi sono applicati dal server. Non salva nulla.",
      inputSchema: routineProposalV2Schema,
      execute: async (proposal) => ({ proposal }),
    }),
  };
}
