import { describe, expect, it, vi } from "vitest";
import {
  createChatInputWarmup,
  shouldScheduleChatInputWarmup,
} from "./chat-input-warmup";

describe("chat input warmup", () => {
  it("schedules only when the user has typed non-empty text for a new chat", () => {
    expect(
      shouldScheduleChatInputWarmup({
        chatId: "chat-1",
        input: "ciao",
        warmedChatId: null,
      }),
    ).toBe(true);
    expect(
      shouldScheduleChatInputWarmup({
        chatId: "chat-1",
        input: "   ",
        warmedChatId: null,
      }),
    ).toBe(false);
    expect(
      shouldScheduleChatInputWarmup({
        chatId: "chat-1",
        input: "ciao",
        warmedChatId: "chat-1",
      }),
    ).toBe(false);
  });

  it("debounces warmup requests and sends at most once per chat", () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const warmup = createChatInputWarmup({
      chatId: "chat-1",
      fetcher,
      delayMs: 250,
    });

    warmup.schedule("c");
    warmup.schedule("ci");
    warmup.schedule("ciao");

    expect(fetcher).not.toHaveBeenCalled();

    vi.advanceTimersByTime(249);
    expect(fetcher).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/chat/warmup", {
      body: JSON.stringify({ chatId: "chat-1" }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    });

    warmup.schedule("ancora");
    vi.advanceTimersByTime(250);
    expect(fetcher).toHaveBeenCalledTimes(1);

    warmup.dispose();
    vi.useRealTimers();
  });

  it("cancels a pending warmup when the input becomes empty", () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const warmup = createChatInputWarmup({
      chatId: "chat-1",
      fetcher,
      delayMs: 250,
    });

    warmup.schedule("ciao");
    warmup.schedule("   ");
    vi.advanceTimersByTime(250);

    expect(fetcher).not.toHaveBeenCalled();

    warmup.dispose();
    vi.useRealTimers();
  });
});
