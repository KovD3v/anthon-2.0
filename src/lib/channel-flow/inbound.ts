import type { ChannelMessagePart } from "./types";

interface BuildExternalChannelInboundInput {
  text?: string | null;
  transcribedText?: string | null;
  voiceInstruction?: string | null;
  fallbackText: string;
  defaultMediaPrompt: string;
  files: ChannelMessagePart[];
}

export function buildExternalChannelInbound({
  text,
  transcribedText,
  voiceInstruction,
  fallbackText,
  defaultMediaPrompt,
  files,
}: BuildExternalChannelInboundInput) {
  const normalizedText = text?.trim() || "";
  const normalizedTranscript = transcribedText?.trim() || "";

  let userMessageText: string;
  if (normalizedText && normalizedTranscript) {
    userMessageText = `${normalizedText}\n\n${voiceInstruction}\n\n[Trascrizione audio]\n${normalizedTranscript}`;
  } else if (normalizedText) {
    userMessageText = normalizedText;
  } else if (normalizedTranscript) {
    userMessageText = `${voiceInstruction}\n\n[Trascrizione audio]\n${normalizedTranscript}`;
  } else {
    userMessageText = fallbackText;
  }

  const parts: ChannelMessagePart[] = [];
  if (userMessageText && (normalizedText || normalizedTranscript)) {
    parts.push({ type: "text", text: userMessageText });
  }

  if (
    parts.length === 0 &&
    files.length > 0 &&
    !files.some((file) => file.type === "text")
  ) {
    parts.push({ type: "text", text: defaultMediaPrompt });
  }

  parts.push(...files);

  return {
    userMessageText,
    parts,
  };
}
