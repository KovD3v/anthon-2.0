import { describe, expect, it } from "vitest";
import { getSafeGuestContinuation } from "./guest-continuation";

describe("getSafeGuestContinuation", () => {
  it.each([
    ["/chat", "/chat"],
    ["/chat/chat_123", "/chat/chat_123"],
    ["%2Fchat%2Fchat_123", "/chat/chat_123"],
    [undefined, "/chat"],
    [["/chat"], "/chat"],
    ["https://evil.example/chat", "/chat"],
    ["//evil.example/chat", "/chat"],
    ["/profile", "/chat"],
    ["/chat/a/b", "/chat"],
    ["/chat\\evil", "/chat"],
    ["%E0%A4%A", "/chat"],
  ])("maps %j to %s", (value, expected) => {
    expect(getSafeGuestContinuation(value)).toBe(expected);
  });
});
