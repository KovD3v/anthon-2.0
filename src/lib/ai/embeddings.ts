import { RAG } from "@/lib/ai/constants";
import { createLogger } from "@/lib/logger";

export const EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_TIMEOUT_MS = 8_000;
const logger = createLogger("ai");

type EmbeddingOptions = { abortSignal?: AbortSignal; timeoutMs?: number };

function isEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSIONS &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function requestSignal(options?: EmbeddingOptions): AbortSignal {
  const timeout = AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return options?.abortSignal
    ? AbortSignal.any([options.abortSignal, timeout])
    : timeout;
}

async function requestEmbeddings(
  inputs: string[],
  options?: EmbeddingOptions,
): Promise<Array<number[] | null>> {
  if (inputs.length === 0) return [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.error(
      "ai.embedding.missing_key",
      "Embedding provider is unavailable",
    );
    return inputs.map(() => null);
  }

  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < RAG.MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Anthon Coach",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL_ID, input: inputs }),
        signal: requestSignal(options),
      });
      lastStatus = response.status;
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) break;
        continue;
      }

      const body = (await response.json()) as {
        data?: Array<{ index?: number; embedding?: unknown }>;
      };
      const output = inputs.map((): number[] | null => null);
      for (const [position, item] of (body.data ?? []).entries()) {
        const index = Number.isInteger(item.index) ? item.index : position;
        if (index !== undefined && index >= 0 && index < output.length) {
          output[index] = isEmbedding(item.embedding) ? item.embedding : null;
        }
      }
      return output;
    } catch (error) {
      if (
        options?.abortSignal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        break;
      }
    }
  }

  logger.warn("ai.embedding.failed", "Embedding request failed", {
    count: inputs.length,
    status: lastStatus,
  });
  return inputs.map(() => null);
}

export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[] | null> {
  if (!text.trim()) return null;
  return (await requestEmbeddings([text], options))[0] ?? null;
}

export async function generateEmbeddings(
  texts: string[],
  options?: EmbeddingOptions,
): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];
  const nonEmpty = texts.map((text) => text.trim());
  if (nonEmpty.every((text) => !text)) return texts.map(() => null);

  const positions = nonEmpty.flatMap((text, index) => (text ? [index] : []));
  const generated = await requestEmbeddings(
    positions.map((index) => nonEmpty[index] ?? ""),
    options,
  );
  const result = texts.map((): number[] | null => null);
  positions.forEach((originalIndex, generatedIndex) => {
    result[originalIndex] = generated[generatedIndex] ?? null;
  });
  return result;
}
