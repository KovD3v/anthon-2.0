import type { ExecutionProfile } from "./execution-routing";

export const LIGHT_EXECUTION_MODEL_ID =
  "deepseek/deepseek-v4-flash-0731" as const;

export function resolveExecutionAttemptModelId(input: {
  profile: ExecutionProfile;
  standardModelId: string;
  explicitModelId?: string | null;
}) {
  return (
    input.explicitModelId ??
    (input.profile === "light"
      ? LIGHT_EXECUTION_MODEL_ID
      : input.standardModelId)
  );
}
