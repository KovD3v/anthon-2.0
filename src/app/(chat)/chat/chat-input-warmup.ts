export const CHAT_INPUT_WARMUP_DEBOUNCE_MS = 350;

type WarmupFetcher = (
  input: string,
  init: {
    body: string;
    headers: { "Content-Type": "application/json" };
    keepalive: true;
    method: "POST";
  },
) => Promise<unknown>;

interface ShouldScheduleChatInputWarmupInput {
  chatId: string;
  input: string;
  warmedChatId: string | null;
}

interface CreateChatInputWarmupInput {
  chatId: string;
  delayMs?: number;
  endpoint?: string;
  fetcher?: WarmupFetcher;
}

export function shouldScheduleChatInputWarmup({
  chatId,
  input,
  warmedChatId,
}: ShouldScheduleChatInputWarmupInput) {
  return input.trim().length > 0 && warmedChatId !== chatId;
}

export function createChatInputWarmup({
  chatId,
  delayMs = CHAT_INPUT_WARMUP_DEBOUNCE_MS,
  endpoint = "/api/chat/warmup",
  fetcher = fetch,
}: CreateChatInputWarmupInput) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let warmedChatId: string | null = null;

  function clearPending() {
    if (!timeout) {
      return;
    }
    clearTimeout(timeout);
    timeout = null;
  }

  return {
    schedule(input: string) {
      if (!shouldScheduleChatInputWarmup({ chatId, input, warmedChatId })) {
        clearPending();
        return;
      }

      clearPending();

      timeout = setTimeout(() => {
        timeout = null;
        if (!shouldScheduleChatInputWarmup({ chatId, input, warmedChatId })) {
          return;
        }

        warmedChatId = chatId;
        void fetcher(endpoint, {
          body: JSON.stringify({ chatId }),
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          method: "POST",
        }).catch(() => {
          // Warmup is opportunistic and must never interrupt typing.
        });
      }, delayMs);
    },
    dispose() {
      clearPending();
    },
  };
}
