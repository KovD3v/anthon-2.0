// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesSection } from "./PreferencesSection";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
  } & React.ComponentProps<"button">) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    />
  ),
}));

const preferences = {
  voiceEnabled: true,
  tone: null,
  mode: null,
  language: "IT",
  push: true,
  showTechnicalMetrics: null,
  effectiveShowTechnicalMetrics: true,
};

describe("PreferencesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(["a non-2xx response", "a network error"] as const)(
    "keeps technical metrics unavailable after %s",
    async (failure) => {
      const fetchMock =
        failure === "a non-2xx response"
          ? vi.fn().mockResolvedValue({ ok: false })
          : vi.fn().mockRejectedValue(new Error("offline"));
      vi.stubGlobal("fetch", fetchMock);

      render(<PreferencesSection />);

      const technicalMetricsSwitch = await screen.findByRole("switch", {
        name: "Mostra dettagli tecnici delle risposte",
      });

      expect((technicalMetricsSwitch as HTMLButtonElement).disabled).toBe(true);
      expect(technicalMetricsSwitch.getAttribute("aria-checked")).toBe("false");
      expect(
        screen.getByText("Impossibile caricare questa preferenza."),
      ).toBeTruthy();
    },
  );

  it("uses the effective value and persists an explicit override after loading", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => preferences,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...preferences,
          showTechnicalMetrics: false,
          effectiveShowTechnicalMetrics: false,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreferencesSection />);

    const technicalMetricsSwitch = await screen.findByRole("switch", {
      name: "Mostra dettagli tecnici delle risposte",
    });
    expect(technicalMetricsSwitch.getAttribute("aria-checked")).toBe("true");
    expect((technicalMetricsSwitch as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(technicalMetricsSwitch);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showTechnicalMetrics: false }),
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Preferenza aggiornata");
  });
});
