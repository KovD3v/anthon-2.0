// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentData } from "@/types/chat";
import { ChatInput } from "./ChatInput";

const recordedAudio: AttachmentData = {
  id: "recording-1",
  name: "recording_123.wav",
  contentType: "audio/wav",
  size: 2048,
  url: "/recording.wav",
};

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  m: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./Attachments", () => ({
  AttachmentButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Allega file
    </button>
  ),
  AttachmentPreview: ({ attachment }: { attachment: AttachmentData }) => (
    <div>Documento: {attachment.name}</div>
  ),
}));

vi.mock("./AudioPlayer", () => ({
  AudioPlayer: ({ name }: { name: string }) => (
    <div data-testid="audio-preview">{name}</div>
  ),
}));

vi.mock("./AudioRecorder", () => ({
  AudioRecorder: ({
    onRecordingComplete,
  }: {
    onRecordingComplete: (attachment: AttachmentData) => void;
  }) => (
    <button type="button" onClick={() => onRecordingComplete(recordedAudio)}>
      Registra messaggio vocale
    </button>
  ),
}));

function renderChatInput(input = "") {
  const props = {
    input,
    isLoading: false,
    setInput: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
  };

  return { ...render(<ChatInput {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatInput audio attachments", () => {
  it("replaces the text composer with uploaded audio and submits it alone", async () => {
    const uploadedAudio: AttachmentData = {
      id: "audio-1",
      name: "nota-vocale.wav",
      contentType: "audio/wav",
      size: 4096,
      url: "/nota-vocale.wav",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(uploadedAudio), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { props } = renderChatInput("bozza da non inviare");
    const file = new File(["audio"], uploadedAudio.name, {
      type: uploadedAudio.contentType,
    });

    fireEvent.change(screen.getByLabelText("Scegli un file da allegare"), {
      target: { files: [file] },
    });

    expect((await screen.findByTestId("audio-preview")).textContent).toBe(
      uploadedAudio.name,
    );
    expect(
      screen.queryByRole("textbox", { name: "Scrivi un messaggio" }),
    ).toBeNull();
    expect(screen.queryByText(`Documento: ${uploadedAudio.name}`)).toBeNull();
    expect(screen.queryByRole("button", { name: "Allega file" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Registra messaggio vocale" }),
    ).toBeNull();
    expect(props.setInput).toHaveBeenCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));

    expect(props.onSubmit).toHaveBeenCalledOnce();
    expect(props.onSubmit.mock.calls[0]?.[1]).toEqual([uploadedAudio]);
  });

  it("uses the same inline composer state for a completed recording", async () => {
    const { props } = renderChatInput("testo precedente");

    fireEvent.click(
      screen.getByRole("button", { name: "Registra messaggio vocale" }),
    );

    expect(screen.getByTestId("audio-preview").textContent).toBe(
      recordedAudio.name,
    );
    expect(
      screen.queryByRole("textbox", { name: "Scrivi un messaggio" }),
    ).toBeNull();
    expect(props.setInput).toHaveBeenCalledWith("");

    fireEvent.click(
      screen.getByRole("button", { name: `Rimuovi ${recordedAudio.name}` }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Scrivi un messaggio" }),
      ).toBeTruthy(),
    );
  });
});
