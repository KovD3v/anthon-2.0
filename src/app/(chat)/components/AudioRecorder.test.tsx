// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioRecorder } from "./AudioRecorder";

class TestMediaRecorder {
  static isTypeSupported() {
    return false;
  }

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

describe("AudioRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", TestMediaRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows an mm:ss timer while recording", async () => {
    render(<AudioRecorder onRecordingComplete={vi.fn()} />);

    expect(screen.queryByText("00:00")).toBeNull();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Registra messaggio vocale" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const timer = screen.getByText("00:00");
    expect(timer.tagName).toBe("TIME");
    expect(timer.className).toContain("font-mono");
    expect(timer.className).not.toContain("border");
    expect(timer.className).not.toContain("bg-");
    expect(screen.queryByText("Registrazione in corso")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("00:01")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("01:01")).toBeTruthy();
  });

  it("reports the busy state while recording", async () => {
    const onRecordingStateChange = vi.fn();
    render(
      <AudioRecorder
        onRecordingComplete={vi.fn()}
        onRecordingStateChange={onRecordingStateChange}
      />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Registra messaggio vocale" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRecordingStateChange).toHaveBeenLastCalledWith(true);
  });
});
