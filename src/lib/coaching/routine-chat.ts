import { normalizeRoutineProposal, type RoutineCardData } from "./routine";

export type RoutineChatMode = "repeat" | "adapt";

export interface PendingRoutineChatContext {
  mode: RoutineChatMode;
  routineId: string;
  /** Client-side snapshot used before the authoritative chat payload arrives. */
  routine?: RoutineCardData;
}

function formatStep(
  step: ReturnType<typeof normalizeRoutineProposal>["practiceSteps"][number],
  index: number,
) {
  const instruction =
    step.kind === "instruction"
      ? step.text
      : `${step.label}: ${step.instruction}`;
  return `${index + 1}. ${instruction}`;
}

export function buildRoutineChatPrompt(
  routine: RoutineCardData,
  mode: RoutineChatMode,
): string {
  const normalized = normalizeRoutineProposal(routine.proposal);
  const instruction =
    mode === "repeat"
      ? "Ripeti questa routine senza modificarla. Guidami passo per passo, con un ritmo calmo, e alla fine chiedimi com'è andata."
      : "Vorrei adattare questa routine. Aiutami a capire cosa cambiare e a proporre una nuova versione solo dopo aver raccolto il mio feedback.";
  const duration = normalized.durationLabel
    ? `\nDurata: ${normalized.durationLabel}`
    : "";
  const steps = normalized.practiceSteps
    .map((step, index) => formatStep(step, index))
    .join("\n");

  return [
    instruction,
    "",
    `Titolo: ${normalized.title}`,
    `Quando usarla: ${normalized.trigger}`,
    duration.trimStart(),
    "Sequenza:",
    steps,
    `Segnale di riuscita: ${normalized.completionCue}`,
  ]
    .filter(Boolean)
    .join("\n");
}
