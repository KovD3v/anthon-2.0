// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./AudioPlayer", () => ({
  AudioPlayer: () => <div data-testid="audio-player" />,
}));

vi.mock("./MemoizedMarkdown", () => ({
  MemoizedMarkdown: ({
    className,
    content,
  }: {
    className?: string;
    content: string;
  }) => (
    <p data-testid="voice-transcript" className={className}>
      {content}
    </p>
  ),
}));

import { VoiceResponse } from "./VoiceResponse";

describe("VoiceResponse dark-card contrast", () => {
  it("keeps transcript and fallback content readable on a dark assistant card", () => {
    const view = render(
      <div className="dark">
        <VoiceResponse
          audioSrc="/api/voice/messages/voice-1"
          transcript="Trascrizione"
          messageId="voice-1"
        />
      </div>,
    );

    const transcriptDetails = screen
      .getByText("Mostra trascrizione")
      .closest("details");
    expect(transcriptDetails?.className).toContain("text-foreground");
    expect(transcriptDetails?.className).toContain("border-border/60");
    expect(transcriptDetails?.className).not.toContain("text-black");
    expect(screen.getByTestId("voice-transcript").className).toContain(
      "prose-p:text-foreground",
    );

    view.rerender(
      <div className="dark">
        <VoiceResponse transcript="" messageId="voice-1" />
      </div>,
    );

    const fallback = screen.getByText(
      "Audio non disponibile. Puoi leggere la trascrizione.",
    );
    expect(fallback.className).toContain("text-muted-foreground");
    expect(fallback.className).toContain("border-border/60");
    expect(fallback.className).not.toContain("text-black");
  });
});
