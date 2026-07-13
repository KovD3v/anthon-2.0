export type ModelExperimentLifecycleAction =
  | "READY"
  | "ACTIVATE"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE";

const transitions = {
  READY: { from: ["DRAFT"], to: "READY" },
  ACTIVATE: { from: ["READY"], to: "ACTIVE" },
  PAUSE: { from: ["ACTIVE"], to: "PAUSED" },
  RESUME: { from: ["PAUSED"], to: "ACTIVE" },
  COMPLETE: { from: ["READY", "ACTIVE", "PAUSED"], to: "COMPLETED" },
} as const;

export function getLifecycleTarget(
  current: string,
  action: ModelExperimentLifecycleAction,
) {
  const transition = transitions[action];
  if (!(transition.from as readonly string[]).includes(current)) {
    throw new Error("INVALID_LIFECYCLE_TRANSITION");
  }
  return transition.to;
}

export function assertConfigurationMutable(status: string) {
  if (status !== "DRAFT") throw new Error("CONFIGURATION_IMMUTABLE");
}
