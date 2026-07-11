import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voiceResponseSource = readFileSync(
  new URL("./VoiceResponse.tsx", import.meta.url),
  "utf8",
);
const audioPlayerSource = readFileSync(
  new URL("./AudioPlayer.tsx", import.meta.url),
  "utf8",
);
const messageListSource = readFileSync(
  new URL("./MessageList.tsx", import.meta.url),
  "utf8",
);

describe("assistant voice response accessibility", () => {
  it("keeps the audio player and exposes a native collapsible transcript", () => {
    expect(voiceResponseSource).toContain("<AudioPlayer");
    expect(voiceResponseSource).toContain("<details");
    expect(voiceResponseSource).toContain("<summary");
    expect(voiceResponseSource).toContain("Mostra trascrizione");
    expect(voiceResponseSource).toContain("<MemoizedMarkdown");
  });

  it("provides useful fallbacks when audio or transcript content is missing", () => {
    expect(voiceResponseSource).toContain("Audio non disponibile");
    expect(voiceResponseSource).toContain("Trascrizione non disponibile");
    expect(audioPlayerSource).toContain("setHasError(!audioSrc)");
  });

  it("plays authenticated relative audio URLs without treating them as base64", () => {
    expect(audioPlayerSource).toContain('src.startsWith("/")');
  });

  it("does not report playback until play succeeds and handles rejection", () => {
    expect(audioPlayerSource).toContain("await audio.play()");
    expect(audioPlayerSource).toMatch(
      /await audio\.play\(\);\s+setIsPlaying\(true\);\s+} catch/,
    );
    expect(audioPlayerSource).toMatch(
      /} catch \{\s+setIsPlaying\(false\);\s+setHasError\(true\)/,
    );
  });

  it("uses the transcript-aware voice response for persisted audio", () => {
    expect(messageListSource).toContain("<VoiceResponse");
    expect(messageListSource).toContain("transcript={messageText}");
  });
});
