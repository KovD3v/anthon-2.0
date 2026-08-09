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
        "Create a proposal-only interactive routine in the validated v2 format when it would concretely help the user. Call at most once per turn. Never save, run, archive, or mutate any Routine or RoutineAttempt. Every step needs a stable id and an instruction, timer, breathing, or form kind. An optional terminal form uses the canonical HELPFUL, PARTIALLY_HELPFUL, and NOT_HELPFUL outcomes. The server enforces duration, cycle, text, and step limits.",
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
