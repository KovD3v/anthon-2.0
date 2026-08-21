// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetaAccessClient } from "./beta-access-client";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

describe("BetaAccessClient", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("renders separate access and release-list forms with unchecked consents", () => {
    render(<BetaAccessClient initialReturnTo="/chat" unavailable={false} />);

    expect(
      screen.getByRole("heading", { name: "Anthon è in beta privata." }),
    ).toBeTruthy();
    const accessForm = screen.getByRole("form", { name: "Accesso beta" });
    const mailingForm = screen.getByRole("form", {
      name: "Lista di attesa",
    });
    expect(within(accessForm).getByLabelText("Password beta")).toBeTruthy();
    expect(within(mailingForm).getByLabelText("Email")).toBeTruthy();
    expect(
      (
        within(mailingForm).getByRole("checkbox", {
          name: /avvisato quando Anthon sarà disponibile/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        within(mailingForm).getByRole("checkbox", {
          name: /novità, strumenti e informazioni/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("unlocks and returns to the original safe destination", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, returnTo: "/chat" }),
    });
    const user = userEvent.setup();
    render(<BetaAccessClient initialReturnTo="/chat" unavailable={false} />);

    await user.type(screen.getByLabelText("Password beta"), "shared-password");
    await user.click(screen.getByRole("button", { name: "Entra in Anthon" }));

    expect(mocks.fetch).toHaveBeenCalledWith("/api/beta-access/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "shared-password",
        returnTo: "/chat",
      }),
    });
    expect(mocks.replace).toHaveBeenCalledWith("/chat");
  });

  it("shows a neutral access error without changing the mailing form", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Password non valida." }),
    });
    const user = userEvent.setup();
    render(<BetaAccessClient initialReturnTo="/" unavailable={false} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password beta"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entra in Anthon" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Password non valida",
    );
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "person@example.com",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("subscribes independently and renders a neutral confirmation", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Iscrizione registrata.",
      }),
    });
    const user = userEvent.setup();
    render(<BetaAccessClient initialReturnTo="/" unavailable={false} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: /avvisato quando Anthon sarà disponibile/i,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /novità, strumenti e informazioni/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Avvisami al rilascio" }),
    );

    expect(mocks.fetch).toHaveBeenCalledWith("/api/beta-access/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "person@example.com",
        releaseConsent: true,
        updatesConsent: true,
      }),
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Ti contatteremo al rilascio",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("requires release consent before sending and prevents duplicate submits", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    mocks.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<BetaAccessClient initialReturnTo="/" unavailable={false} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    const submit = screen.getByRole("button", { name: "Avvisami al rilascio" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(
      screen.getByRole("checkbox", {
        name: /avvisato quando Anthon sarà disponibile/i,
      }),
    );
    await user.click(submit);
    await user.click(submit);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    resolveRequest?.({
      ok: true,
      json: async () => ({ success: true }),
    });
    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("surfaces a recoverable service-unavailable state from the proxy", () => {
    render(<BetaAccessClient initialReturnTo="/chat" unavailable />);

    expect(screen.getByRole("alert").textContent).toContain(
      "temporaneamente non disponibile",
    );
  });
});
