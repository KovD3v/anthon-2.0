import { z } from "zod";
import { CHAT_ICON_KEYS } from "@/lib/chat-icons";

const MAX_CONTEXT_LENGTH = 1_600;
const MAX_FIRST_USER_TEXT_LENGTH = 1_520;

export type ChatMetadataMessage = {
  role: "user" | "assistant";
  text: string;
};

export const chatMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(55)
    .refine((value) => {
      const words = value.split(/\s+/).filter(Boolean).length;
      return words >= 3 && words <= 6;
    }, "title must contain 3-6 words"),
  icon: z.enum(CHAT_ICON_KEYS),
});

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildChatMetadataContext(
  messages: readonly ChatMetadataMessage[],
  fallbackUserText: string,
): string {
  const firstUserText =
    messages.find(
      (message) => message.role === "user" && compactWhitespace(message.text),
    )?.text ?? fallbackUserText;
  const first = compactWhitespace(firstUserText)
    .slice(0, MAX_FIRST_USER_TEXT_LENGTH)
    .trimEnd();
  const prefix = `PRIMO BISOGNO UTENTE: ${first}`;
  const selected: string[] = [];
  let remaining = Math.max(0, MAX_CONTEXT_LENGTH - prefix.length - 1);

  for (const message of [...messages].reverse()) {
    const text = compactWhitespace(message.text);
    if (!text || (message.role === "user" && text === first)) {
      continue;
    }

    const line = `${message.role.toUpperCase()}: ${text}`;
    if (line.length <= remaining) {
      selected.push(line);
      remaining -= line.length + 1;
      continue;
    }

    if (remaining >= 40) {
      selected.push(line.slice(0, remaining).trimEnd());
    }
    break;
  }

  return [prefix, ...selected.reverse()].filter(Boolean).join("\n");
}

export function buildChatMetadataPrompt(context: string): string {
  return `Genera i metadati di una conversazione di coaching in italiano.
Il titolo deve avere 3-6 parole, massimo 55 caratteri, senza virgolette, emoji,
etichette o punteggiatura finale. Descrivi il bisogno, la decisione, l'evento o
l'esito concreto dell'utente. Preferisci le parole specifiche usate dall'utente.
Evita titoli generici come Conversazione, Supporto, Coaching o Nuova chat quando
esiste un tema specifico.

Scegli una sola icona:
- TARGET: obiettivi e focus;
- TROPHY: gara e risultati;
- DUMBBELL: forza e allenamento;
- ACTIVITY: prestazione, carico e recupero;
- BRAIN: mentalità e abilità mentali;
- HEART_PULSE: salute, dolore e segnali fisici;
- TIMER: ritmo e pressione temporale;
- CALENDAR_DAYS: programmi e pianificazione;
- FLAME: motivazione;
- SHIELD: sicurezza e fiducia;
- USERS: coach, squadra e relazioni;
- FOOTPRINTS: corsa e progressione;
- REFRESH_CCW: reset e ripartenza;
- MESSAGE_SQUARE: solo per un tema davvero vago.

Contesto:
${context}`;
}
