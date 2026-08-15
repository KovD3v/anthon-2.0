// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingClient } from "./onboarding-client";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));

const initialState = {
  status: "IN_PROGRESS" as const,
  currentStep: 0,
  totalSteps: 5 as const,
  currentField: "name" as const,
  question: "Come vuoi che ti chiami?",
  skipLabel: "Preferisco non dirlo",
  draft: {
    name: null,
    age: null,
    occupation: null,
    sport: null,
    experience: null,
    goal: null,
  },
  skippedFields: [],
  messages: [
    {
      id: "assistant-1",
      role: "assistant" as const,
      content: "Come vuoi che ti chiami?",
    },
  ],
};

describe("OnboardingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the isolated first step and profile panel", () => {
    const { container } = render(
      <OnboardingClient initialState={initialState} nextPath="/chat" />,
    );

    expect(screen.getByText("Passaggio 1 di 5")).toBeTruthy();
    expect(screen.getByText("Come vuoi che ti chiami?")).toBeTruthy();
    expect(
      screen.getAllByText("Profilo in costruzione").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Preferisco non dirlo" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();

    const main = container.querySelector("main");
    const firstMessage = container.querySelector(
      '[data-testid="onboarding-message-assistant-1"]',
    );
    const firstMessageRow = firstMessage?.firstElementChild;
    const conversation = container.querySelector(
      '[data-testid="onboarding-conversation"]',
    );
    expect(main?.className).toContain("h-dvh");
    expect(firstMessage?.className).toContain("w-full");
    expect(firstMessageRow?.className).toContain("w-full");
    expect(conversation?.className).toContain("min-h-0");
    expect(conversation?.className).not.toContain("min-h-[70vh]");
  });

  it("shows the user answer immediately while Anthon is reading", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<OnboardingClient initialState={initialState} nextPath="/chat" />);

    await user.type(screen.getByLabelText("La tua risposta"), "Giulia");
    await user.click(screen.getByRole("button", { name: "Invia risposta" }));

    expect(screen.getByText("Giulia")).toBeTruthy();
    expect(screen.getByText("Anthon sta leggendo…")).toBeTruthy();

    resolveRequest?.(
      new Response(JSON.stringify(initialState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("focuses the composer after a response on desktop", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const responseState = {
      ...initialState,
      currentStep: 1,
      currentField: "age" as const,
      question: "Quanti anni hai?",
      messages: [
        ...initialState.messages,
        { id: "user-1", role: "user" as const, content: "Giulia" },
        {
          id: "assistant-2",
          role: "assistant" as const,
          content: "Quanti anni hai?",
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(responseState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const user = userEvent.setup();
    render(<OnboardingClient initialState={initialState} nextPath="/chat" />);
    const textarea = screen.getByLabelText("La tua risposta");

    await user.type(textarea, "Giulia");
    await user.click(screen.getByRole("button", { name: "Invia risposta" }));

    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(vi.mocked(matchMedia)).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});
