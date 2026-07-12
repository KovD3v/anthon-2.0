import { describe, expect, it } from "vitest";
import { detectVoiceRequestIntent, getVoiceUnavailability } from "./policy";

describe("voice/policy", () => {
  it.each([
    "Mandami un vocale",
    "Please send me a voice message",
    "Reply with a voice note",
  ])("detects explicit voice intent in %s", (message) => {
    expect(detectVoiceRequestIntent(message)).toBe("VOICE");
  });

  it("gives explicit text intent precedence", () => {
    expect(
      detectVoiceRequestIntent("Send a voice message, but write it instead"),
    ).toBe("TEXT");
  });

  it("returns a stable user-facing provider message", () => {
    expect(getVoiceUnavailability("PROVIDER_UNAVAILABLE")).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      userMessage: "Voice is temporarily unavailable, so I'm replying in text.",
    });
  });
});
