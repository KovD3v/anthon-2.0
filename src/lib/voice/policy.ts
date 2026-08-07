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
      "Ho ricevuto e trascritto il tuo messaggio vocale. Le risposte vocali non sono ancora disponibili durante la prova, quindi ti rispondo in testo.",
    QUIET_MODE:
      "Le risposte vocali sono disattivate nelle tue preferenze, quindi ti rispondo in testo.",
    PROVIDER_UNAVAILABLE:
      "Le risposte vocali non sono temporaneamente disponibili, quindi ti rispondo in testo.",
    QUOTA_REACHED:
      "Hai raggiunto il limite attuale di risposte vocali, quindi ti rispondo in testo.",
  };
  return { code, userMessage: messages[code] };
}
