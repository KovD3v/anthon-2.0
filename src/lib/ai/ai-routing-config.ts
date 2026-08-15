import { z } from "zod";
import {
  LIGHT_TASK_KINDS,
  parseExecutionRoutingConfig,
} from "./execution-routing";

export const AI_ROUTING_CONFIG_ID = "default";

export const aiRoutingConfigSchema = z
  .object({
    liveClassifierEnabled: z.boolean(),
    executionRoutingMode: z.enum(["off", "shadow", "active"]),
    executionRoutingAllocationPercent: z.number().int().min(0).max(100),
    executionRoutingTasks: z
      .array(z.enum(LIGHT_TASK_KINDS))
      .max(LIGHT_TASK_KINDS.length),
  })
  .superRefine((config, context) => {
    if (
      config.executionRoutingMode !== "off" &&
      config.executionRoutingTasks.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["executionRoutingTasks"],
        message: "Una modalità di rollout richiede almeno un task allowlistato",
      });
    }

    if (
      new Set(config.executionRoutingTasks).size !==
      config.executionRoutingTasks.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["executionRoutingTasks"],
        message: "La allowlist non può contenere task duplicati",
      });
    }
  });

export type AiRoutingConfigInput = z.infer<typeof aiRoutingConfigSchema>;
export type AiRoutingConfigSource = "database" | "environment";

export type AiRoutingRuntimeConfig = AiRoutingConfigInput & {
  source: AiRoutingConfigSource;
  updatedAt: Date | null;
};

export function parseAiRoutingConfig(input: unknown): AiRoutingConfigInput {
  return aiRoutingConfigSchema.parse(input);
}

export function parsePersistedAiRoutingConfig(
  input: unknown,
): AiRoutingConfigInput | null {
  const result = aiRoutingConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function getEnvironmentAiRoutingConfig(
  env: Record<string, string | undefined> = process.env,
): AiRoutingConfigInput {
  const executionRouting = parseExecutionRoutingConfig(env);

  return {
    liveClassifierEnabled: env.AI_LIVE_CLASSIFIER_ENABLED === "true",
    executionRoutingMode: executionRouting.mode,
    executionRoutingAllocationPercent: executionRouting.allocationPercent,
    executionRoutingTasks: [...executionRouting.enabledTaskKinds],
  };
}
