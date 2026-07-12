export type VoiceRequestIntent = "VOICE" | "TEXT" | "UNSPECIFIED";

export type VoiceUnavailableCode =
  | "PLAN_NOT_ELIGIBLE"
  | "QUIET_MODE"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_REACHED";

export interface VoiceUnavailability {
  code: VoiceUnavailableCode;
  userMessage: string;
}

const explicitVoiceRegex =
  /\b(vocale|audio|nota vocale|messaggio vocale|mandamelo a voce|mandami un vocale|rispondimi a voce|voice(?: message| note)?|audio message|reply (?:with|in) (?:a )?voice|send (?:me )?(?:a )?voice)\b/i;
const explicitTextRegex =
  /\b(scrivi|scritto|testo|lista|schema|tabella|link|codice|markdown|write it|in writing|text only|written response)\b/i;

export function detectVoiceRequestIntent(message: string): VoiceRequestIntent {
  if (explicitTextRegex.test(message)) return "TEXT";
  if (explicitVoiceRegex.test(message)) return "VOICE";
  return "UNSPECIFIED";
}

export function getVoiceUnavailability(
  code: VoiceUnavailableCode,
): VoiceUnavailability {
  const messages: Record<VoiceUnavailableCode, string> = {
    PLAN_NOT_ELIGIBLE:
      "I can't send a voice response with your current plan, so I'm replying in text.",
    QUIET_MODE:
      "Voice responses are disabled in your preferences, so I'm replying in text.",
    PROVIDER_UNAVAILABLE:
      "Voice is temporarily unavailable, so I'm replying in text.",
    QUOTA_REACHED:
      "You've reached your voice-response limit for now, so I'm replying in text.",
  };
  return { code, userMessage: messages[code] };
}
