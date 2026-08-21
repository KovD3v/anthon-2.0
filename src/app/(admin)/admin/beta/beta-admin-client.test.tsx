// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetaAdminClient } from "./beta-admin-client";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

let configResponse: unknown;

describe("BetaAdminClient", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    configResponse = { configured: false, active: false };
    mocks.fetch.mockImplementation(
      async (input: string, init?: RequestInit) => {
        if (input === "/api/admin/beta-access" && init?.method === "PATCH") {
          return {
            ok: true,
            json: async () => ({
              configured: true,
              active: true,
              accessVersion: 2,
              activatedAt: "2026-08-16T10:00:00.000Z",
              rotatedAt: "2026-08-16T12:00:00.000Z",
            }),
          };
        }
        if (input === "/api/admin/beta-access" && init?.method === "PUT") {
          const { active } = JSON.parse(String(init.body)) as {
            active: boolean;
          };
          return {
            ok: true,
            json: async () => ({
              configured: true,
              active,
              accessVersion: active ? 5 : 6,
              activatedAt: "2026-08-16T10:00:00.000Z",
              rotatedAt: "2026-08-16T12:00:00.000Z",
            }),
          };
        }
        if (input === "/api/admin/beta-access") {
          return { ok: true, json: async () => configResponse };
        }
        if (input.startsWith("/api/admin/beta-access/subscribers")) {
          return {
            ok: true,
            json: async () => ({
              subscribers: [
                {
                  id: "subscriber-1",
                  email: "person@example.com",
                  releaseOptInAt: "2026-08-16T10:00:00.000Z",
                  updatesOptInAt: "2026-08-16T10:01:00.000Z",
                  updatesOptOutAt: null,
                  consentVersion: "privacy-2026-08-16",
                  createdAt: "2026-08-16T10:00:00.000Z",
                  updatedAt: "2026-08-16T10:01:00.000Z",
                },
              ],
              pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
              metrics: { total: 1, updates: 1 },
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${input}`);
      },
    );
  });

  it("shows gate state, metrics, subscriber evidence, and export", async () => {
    render(<BetaAdminClient />);

    expect(
      await screen.findByRole("heading", { name: "Beta privata" }),
    ).toBeTruthy();
    expect(await screen.findByText("Non configurata")).toBeTruthy();
    expect(screen.getByText("person@example.com")).toBeTruthy();
    expect(screen.getByText("Aggiornamenti attivi")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Esporta CSV" }).getAttribute("href"),
    ).toBe("/api/admin/beta-access/export");
  });

  it("validates confirmation locally before rotating", async () => {
    const user = userEvent.setup();
    render(<BetaAdminClient />);
    await screen.findByText("Non configurata");

    await user.type(
      screen.getByLabelText("Nuova password beta"),
      "a long beta password",
    );
    await user.type(
      screen.getByLabelText("Conferma password beta"),
      "a different password",
    );
    await user.click(
      screen.getByRole("button", { name: "Attiva la beta privata" }),
    );

    expect(screen.getByRole("alert").textContent).toContain("non coincidono");
    expect(
      mocks.fetch.mock.calls.filter(
        ([input, init]) =>
          input === "/api/admin/beta-access" && init?.method === "PATCH",
      ),
    ).toHaveLength(0);
  });

  it("rotates the password and explains global revocation", async () => {
    const user = userEvent.setup();
    render(<BetaAdminClient />);
    await screen.findByText("Non configurata");

    await user.type(
      screen.getByLabelText("Nuova password beta"),
      "a long beta password",
    );
    await user.type(
      screen.getByLabelText("Conferma password beta"),
      "a long beta password",
    );
    await user.click(
      screen.getByRole("button", { name: "Attiva la beta privata" }),
    );

    await waitFor(() => expect(screen.getAllByText("Attiva")).toHaveLength(2));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/beta-access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "a long beta password",
        confirmation: "a long beta password",
      }),
    });
    expect(screen.getByRole("status").textContent).toContain(
      "accessi precedenti sono stati revocati",
    );
  });

  it("re-enables a configured gate without asking for a new password", async () => {
    configResponse = {
      configured: true,
      active: false,
      accessVersion: 5,
      activatedAt: "2026-08-16T10:00:00.000Z",
      rotatedAt: "2026-08-16T12:00:00.000Z",
    };
    const user = userEvent.setup();
    render(<BetaAdminClient />);

    expect(await screen.findAllByText("Disattivata")).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "Attiva beta privata" }),
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/beta-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "beta privata è attiva",
    );
  });

  it("disables the gate and explains that existing access is revoked", async () => {
    configResponse = {
      configured: true,
      active: true,
      accessVersion: 5,
      activatedAt: "2026-08-16T10:00:00.000Z",
      rotatedAt: "2026-08-16T12:00:00.000Z",
    };
    const user = userEvent.setup();
    render(<BetaAdminClient />);

    await user.click(
      await screen.findByRole("button", {
        name: "Disattiva beta privata",
      }),
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/beta-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "accessi esistenti sono stati revocati",
    );
  });

  it("filters the subscriber list without changing authorization", async () => {
    const user = userEvent.setup();
    render(<BetaAdminClient />);
    await screen.findByText("person@example.com");

    await user.selectOptions(
      screen.getByLabelText("Filtra iscritti"),
      "updates",
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/admin/beta-access/subscribers?page=1&limit=25&updatesOnly=true",
      ),
    );
  });
});
