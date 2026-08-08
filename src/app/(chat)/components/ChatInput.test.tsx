// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_ATTACHMENT_ACCEPT } from "@/lib/uploads/chat-file-types";
import type { AttachmentData } from "@/types/chat";
import { ChatInput } from "./ChatInput";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));

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
  toast: { error: mocks.toastError, success: vi.fn() },
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
  mocks.toastError.mockReset();
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

  it("keeps a focus request pending while audio hides the textarea", async () => {
    const props = {
      input: "Inizio ora la routine",
      isLoading: false,
      focusRequestId: 0,
      setInput: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
    };
    const user = userEvent.setup();
    const view = render(<ChatInput {...props} />);

    await user.click(
      screen.getByRole("button", { name: "Registra messaggio vocale" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Scrivi un messaggio" }),
    ).toBeNull();

    view.rerender(<ChatInput {...props} focusRequestId={1} />);
    await user.click(
      screen.getByRole("button", { name: `Rimuovi ${recordedAudio.name}` }),
    );

    const restoredTextarea = await screen.findByRole("textbox", {
      name: "Scrivi un messaggio",
    });
    await waitFor(() => expect(document.activeElement).toBe(restoredTextarea));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("keeps a focus request pending while the textarea is disabled", async () => {
    const props = {
      input: "Inizio ora la routine",
      isLoading: false,
      disabledReason: "Chat non disponibile",
      focusRequestId: 0,
      setInput: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
    };
    const view = render(<ChatInput {...props} />);
    const textarea = screen.getByRole("textbox", {
      name: "Scrivi un messaggio",
    });

    view.rerender(<ChatInput {...props} focusRequestId={1} />);
    expect(document.activeElement).not.toBe(textarea);

    view.rerender(
      <ChatInput {...props} disabledReason={undefined} focusRequestId={1} />,
    );

    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("resizes the textarea when an external routine prefill changes input", async () => {
    const props = {
      input: "",
      isLoading: false,
      focusRequestId: 0,
      setInput: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
    };
    const view = render(<ChatInput {...props} />);
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Scrivi un messaggio",
    });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 144,
    });

    view.rerender(
      <ChatInput
        {...props}
        input="Inizio ora la routine: Reset rapido. Ti aggiorno dopo il tentativo."
        focusRequestId={1}
      />,
    );

    await waitFor(() => expect(textarea.style.height).toBe("144px"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("does not remeasure or refocus for an unrelated parent rerender", () => {
    const props = {
      input: "Inizio ora la routine",
      isLoading: false,
      focusRequestId: 0,
      onInputWarmup: vi.fn(),
      setInput: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
    };
    const view = render(<ChatInput {...props} />);
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Scrivi un messaggio",
    });
    const focusSpy = vi.spyOn(textarea, "focus");
    textarea.style.height = "77px";

    view.rerender(
      <ChatInput {...props} onInputWarmup={vi.fn()} onStop={vi.fn()} />,
    );

    expect(textarea.style.height).toBe("77px");
    expect(focusSpy).not.toHaveBeenCalled();
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

describe("ChatInput file selection", () => {
  it("uses explicit extensions so Finder does not enable HEIC or HEIF", () => {
    renderChatInput();

    const input = screen.getByLabelText("Scegli un file da allegare");
    expect(input.getAttribute("accept")).toBe(CHAT_ATTACHMENT_ACCEPT);
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".jpg");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".png");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain("image/*");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain(".heic");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain(".heif");
  });

  it("rejects an unsupported iPhone photo before starting the upload", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderChatInput();
    const input = screen.getByLabelText<HTMLInputElement>(
      "Scegli un file da allegare",
    );
    const file = new File(["photo"], "IMG_1234.HEIC", {
      type: "image/heic",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Formato non supportato. Per le foto iPhone usa JPG o PNG, non HEIC/HEIF.",
    );
    expect(input.value).toBe("");
  });
});
