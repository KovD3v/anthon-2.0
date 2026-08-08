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
  AudioPlayer: ({ name, variant }: { name: string; variant: string }) => (
    <div data-testid="audio-preview" data-variant={variant}>
      {name}
    </div>
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

describe("ChatInput keyboard behavior", () => {
  it("focuses the textarea when a new external focus request arrives", () => {
    const props = {
      input: "Inizio ora la routine",
      isLoading: false,
      focusRequestId: 0,
      setInput: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
    };
    const view = render(<ChatInput {...props} />);
    const textarea = screen.getByRole("textbox", {
      name: "Scrivi un messaggio",
    });
    textarea.blur();

    view.rerender(<ChatInput {...props} focusRequestId={1} />);

    expect(document.activeElement).toBe(textarea);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("keeps Enter available for a new line without submitting", () => {
    const { props } = renderChatInput("Prima riga");
    const textarea = screen.getByRole("textbox", {
      name: "Scrivi un messaggio",
    });

    expect(fireEvent.keyDown(textarea, { key: "Enter" })).toBe(true);
    expect(props.onSubmit).not.toHaveBeenCalled();

    fireEvent.change(textarea, {
      target: { value: "Prima riga\nSeconda riga" },
    });
    expect(props.setInput).toHaveBeenCalledWith("Prima riga\nSeconda riga");
  });

  it("still submits from the send button", () => {
    const { props } = renderChatInput("Messaggio");

    fireEvent.click(screen.getByRole("button", { name: "Invia messaggio" }));

    expect(props.onSubmit).toHaveBeenCalledOnce();
  });
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
    expect(screen.getByTestId("audio-preview").dataset.variant).toBe(
      "composer",
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
