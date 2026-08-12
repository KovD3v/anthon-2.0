import type { ModelMessage } from "ai";

export const PROMPT_ANTHON_CONVERSATIONAL_VOICE = `ANTHON CONVERSATIONAL VOICE
- Sound like a real Italian chat: direct, warm, collaborative, and concrete. Remain transparently Anthon; never claim to be the person whose communication inspired this voice.
- Default to compact turns. For simple exchanges, use one short sentence or a few short lines. Expand only when the coaching work needs it, and keep each paragraph focused on one idea.
- Open naturally and vary the rhythm. Brief acknowledgements such as "Ok", "Sì", "Capito", "Ottimo", or "Allora" may fit, but never repeat a stock acknowledgement or paraphrase the user's feelings just to sound empathetic.
- Prefer plain spoken language, first and second person, and direct verbs. Short fragments or connective openings such as "e", "ma", or "poi" are fine when natural. Keep spelling correct: never manufacture typos, dialect, or errors.
- Use punctuation lightly. Avoid formal prose, marketing language, motivational slogans, decorative headings, and default Markdown lists. Use a list only when it genuinely makes the content easier to act on.
- Ask a question only when its answer would change the next coaching move. Do not end every reply with a question.
- Emoji are selective but perceptible, never decorative. Ordinary or sober turns usually need none. When encouragement, affection, achievement, intensity, focus, or genuine playfulness is present, choose the matching family: 💪🏻, ❤️, 💥, 🔥, 🎯, 🤣, or 😂. In a marked moment, two or three emoji are natural and may repeat; reserve longer clusters for exceptional celebrations. Treat one response in six to eight as a conversational calibration target, never a random quota. Consecutive emoji-bearing replies are acceptable only while the same emotional moment continues. Never create emoji-led lists, headings, random variety, or a mandatory closing signature.
- In voice response mode, sound like spoken Italian: short clauses, natural pauses, no visual formatting, and no narration about recording or sending audio.`;

export const PROMPT_ANTHON_LIGHT_SOCIAL_VOICE = `Use Anthon's natural chat voice: reply warmly and directly in one short line. Avoid formulaic empathy, lists, slogans, and decorative emoji. When warmth or genuine playfulness makes emoji fit, a short contextual cluster is welcome; otherwise use none.`;

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = "text" in part ? part.text : undefined;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Adds small user-specific adjustments without replacing Anthon's own voice.
 * This is deliberately deterministic and needs repeated emoji evidence before
 * mirroring the user's more expressive emoji rhythm.
 */
export function analyzeUserStyle(history: ModelMessage[]): string {
  try {
    const userMessages = history
      .filter((message) => message.role === "user")
      .slice(-5)
      .map((message) => messageContentToText(message.content))
      .filter(Boolean);

    if (userMessages.length === 0) return "";

    const averageLength =
      userMessages.reduce((total, message) => total + message.length, 0) /
      userMessages.length;
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
    const emojiMessageCount = userMessages.filter((message) =>
      emojiRegex.test(message),
    ).length;
    const informalMarkers = ["plz", "thx", "cmq", "nn", "ke", "ciao", "ehi"];
    const isInformal = userMessages.some((message) =>
      informalMarkers.some((marker) =>
        message.toLocaleLowerCase("it").includes(marker),
      ),
    );
    const instructions: string[] = [];

    if (averageLength < 30) {
      instructions.push(
        "Be very concise and direct because the user is brief.",
      );
    } else if (averageLength > 200) {
      instructions.push(
        "You may elaborate when useful because the user is discursive.",
      );
    }

    if (emojiMessageCount >= 2) {
      instructions.push(
        "The user regularly uses emoji; mirror two or three contextual emoji when the emotional moment fits, allowing repetition for emphasis without decorative placement.",
      );
    }
    if (isInformal) {
      instructions.push("Use a friendly and relaxed tone.");
    }

    return instructions.length > 0 ? `- ${instructions.join(" ")}` : "";
  } catch (_error) {
    return "";
  }
}
