import { z } from "zod";

export const voiceSuitabilitySchema = z.object({
  category: z.enum([
    "VOICE_STRONG",
    "VOICE_NATURAL",
    "TEXT_PREFERRED",
    "TEXT_REQUIRED",
  ]),
  reason: z.enum([
    "emotional_support",
    "brief_motivation",
    "reflective_coaching",
    "storytelling",
    "natural_conversation",
    "short_factual",
    "technical_or_structured",
    "needs_visual_precision",
    "unclear",
  ]),
  confidence: z.number().min(0).max(1),
});

export type VoiceSuitabilityCategory = z.infer<
  typeof voiceSuitabilitySchema
>["category"];

export type VoiceSuitabilityPromptVariant =
  | "baseline"
  | "nemotron_a"
  | "nemotron_b";

export interface VoiceSuitabilityPromptInput {
  userMessage: string;
  recentConversation: string;
  assistantText?: string;
}

const BASELINE_GUIDANCE = `VOICE_STRONG: emotional support, grounding, motivation, or a moment where tone materially helps.
VOICE_NATURAL: reflective coaching, storytelling, or natural conversational explanation.
TEXT_REQUIRED: code, dense data, exact commands, complex tables, or content that must be seen precisely.
TEXT_PREFERRED: short factual or coordination content where audio adds little value.

Do not reject voice merely because of one link, light formatting, an attachment, or the absence of emotional keywords. Judge whether spoken delivery improves this conversational moment.`;

const NEMOTRON_A_GUIDANCE = `Use this decision hierarchy:
1. Choose TEXT_REQUIRED for content that must be seen precisely, including code, dense data, exact commands, and complex tables.
2. Choose TEXT_PREFERRED for link-only, short factual, coordination, time, date, score, or status answers.
3. Choose VOICE_STRONG only when emotional tone materially helps, such as support, grounding, or brief motivation.
4. Choose VOICE_NATURAL only for reflective coaching, storytelling, or a genuinely conversational explanation.
5. When uncertain whether audio adds material value, choose TEXT_PREFERRED.

Examples:
- "Che ore sono a Roma?" -> TEXT_PREFERRED, short_factual.
- "Dammi solo il link ufficiale." -> TEXT_PREFERRED, short_factual.`;

const NEMOTRON_B_GUIDANCE = `When uncertain whether audio adds material value, choose TEXT_PREFERRED.

Use this decision hierarchy:
1. TEXT_REQUIRED: content that must be seen precisely, including code, dense data, exact commands, and complex tables.
2. TEXT_PREFERRED: link-only, short factual, coordination, time, date, score, or status answers.
3. VOICE_STRONG: only when emotional tone materially helps, such as support, grounding, or brief motivation.
4. VOICE_NATURAL: only for reflective coaching, storytelling, or a genuinely conversational explanation.`;

function guidanceForVariant(variant: VoiceSuitabilityPromptVariant): string {
  if (variant === "nemotron_a") return NEMOTRON_A_GUIDANCE;
  if (variant === "nemotron_b") return NEMOTRON_B_GUIDANCE;
  return BASELINE_GUIDANCE;
}

export function buildVoiceSuitabilityPrompt(
  input: VoiceSuitabilityPromptInput,
  variant: VoiceSuitabilityPromptVariant,
): string {
  return `Classify the best delivery format for this coaching response.

${guidanceForVariant(variant)}

Recent conversation:
${input.recentConversation}

User: ${input.userMessage}
${input.assistantText ? `Assistant: ${input.assistantText.slice(0, 700)}` : "Assistant response has not been generated yet."}`;
}
