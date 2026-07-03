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
  const transcriptPrefix = voiceInstruction
    ? `${voiceInstruction}\n\n[Trascrizione audio]`
    : "[Trascrizione audio]";
  if (normalizedText && normalizedTranscript) {
    userMessageText = `${normalizedText}\n\n${transcriptPrefix}\n${normalizedTranscript}`;
  } else if (normalizedText) {
    userMessageText = normalizedText;
  } else if (normalizedTranscript) {
    userMessageText = `${transcriptPrefix}\n${normalizedTranscript}`;
  } else {
    userMessageText =
      files.length > 0 && !files.some((file) => file.type === "text")
        ? defaultMediaPrompt
        : fallbackText;
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
