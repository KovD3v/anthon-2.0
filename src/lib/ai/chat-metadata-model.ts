import type { JSONObject } from "@ai-sdk/provider";
import { LIGHT_EXECUTION_MODEL_ID } from "./execution-model";
import {
  getOpenRouterProviderOptionsForClassifier,
  getOpenRouterProviderOptionsForExecution,
} from "./providers/openrouter-routing";

export const CHAT_METADATA_MODEL_CANDIDATES = [
  "deepseek/deepseek-v4-flash",
  LIGHT_EXECUTION_MODEL_ID,
  "nvidia/nemotron-3.5-lightning",
] as const;

export type ChatMetadataModelId =
  (typeof CHAT_METADATA_MODEL_CANDIDATES)[number];

// Keep the incumbent until the consolidation benchmark clears a replacement.
export const CHAT_METADATA_MODEL_ID: ChatMetadataModelId =
  "deepseek/deepseek-v4-flash";

type Env = Record<string, string | undefined>;

export function getChatMetadataProviderOptions(
  modelId: ChatMetadataModelId,
  env: Env = process.env,
): JSONObject {
  if (modelId === LIGHT_EXECUTION_MODEL_ID) {
    return getOpenRouterProviderOptionsForExecution(modelId, "light", env);
  }

  const options = getOpenRouterProviderOptionsForClassifier(modelId, env);
  if (modelId === "nvidia/nemotron-3.5-lightning") {
    return options;
  }

  const provider =
    options.provider && typeof options.provider === "object"
      ? options.provider
      : {};

  return {
    ...options,
    provider: { ...provider, require_parameters: true },
  };
}
