import type { JSONObject } from "@ai-sdk/provider";
import { getOpenRouterProviderOptionsForClassifier } from "./providers/openrouter-routing";

export const CHAT_METADATA_MODEL_CANDIDATES = [
  "deepseek/deepseek-v4-flash",
  "google/gemini-2.5-flash-lite",
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
