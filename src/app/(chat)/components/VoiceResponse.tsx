"use client";

import { FileText } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { MemoizedMarkdown } from "./MemoizedMarkdown";

interface VoiceResponseProps {
  audioSrc?: string;
  transcript: string;
  messageId: string;
}

export function VoiceResponse({
  audioSrc,
  transcript,
  messageId,
}: VoiceResponseProps) {
  const normalizedTranscript = transcript.trim();

  return (
    <div className="min-w-[200px] space-y-2">
      {audioSrc ? (
        <AudioPlayer
          src={audioSrc}
          name="Messaggio vocale"
          mimeType="audio/mpeg"
        />
      ) : (
        <output className="flex items-center gap-2 rounded-lg border border-black/15 bg-black/5 px-3 py-2 text-xs text-black/75">
          Audio non disponibile. Puoi leggere la trascrizione.
        </output>
      )}

      {normalizedTranscript ? (
        <details className="group rounded-xl border border-black/15 bg-black/5 text-black">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-black/40 [&::-webkit-details-marker]:hidden">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mostra trascrizione</span>
            <span className="ml-auto text-[10px] text-black/55 group-open:hidden">
              Apri
            </span>
            <span className="ml-auto hidden text-[10px] text-black/55 group-open:inline">
              Chiudi
            </span>
          </summary>
          <div
            id={`${messageId}-voice-transcript`}
            className="border-black/10 border-t px-3 py-2.5"
          >
            <MemoizedMarkdown
              content={normalizedTranscript}
              className="prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-p:text-black prose-strong:text-black prose-li:text-black prose-a:text-black"
            />
          </div>
        </details>
      ) : (
        <output className="block px-1 text-xs text-black/65">
          Trascrizione non disponibile.
        </output>
      )}
    </div>
  );
}
