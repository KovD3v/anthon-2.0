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

  it.each([
    [
      "PLAN_NOT_ELIGIBLE" as const,
      "Ho ricevuto e trascritto il tuo messaggio vocale. Le risposte vocali non sono ancora disponibili durante la prova, quindi ti rispondo in testo.",
    ],
    [
      "QUIET_MODE" as const,
      "Le risposte vocali sono disattivate nelle tue preferenze, quindi ti rispondo in testo.",
    ],
    [
      "PROVIDER_UNAVAILABLE" as const,
      "Le risposte vocali non sono temporaneamente disponibili, quindi ti rispondo in testo.",
    ],
    [
      "QUOTA_REACHED" as const,
      "Hai raggiunto il limite attuale di risposte vocali, quindi ti rispondo in testo.",
    ],
  ])("returns Italian user-facing copy for %s", (code, userMessage) => {
    expect(getVoiceUnavailability(code)).toEqual({ code, userMessage });
  });
});
