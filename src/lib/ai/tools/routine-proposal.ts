import { tool } from "ai";
import { routineProposalSchema } from "@/lib/coaching/routine";

export function createRoutineProposalTool() {
  return {
    proposeRoutine: tool({
      description: "Proponi una routine pratica strutturata. Non salva nulla.",
      inputSchema: routineProposalSchema,
      execute: async (proposal) => ({ proposal }),
    }),
  };
}
