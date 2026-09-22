// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSection } from "./BillingSection";

const { confirmSetup } = vi.hoisted(() => ({ confirmSetup: vi.fn() }));
vi.mock("@/lib/billing/stripe-client", () => ({
  getStripeTestClient: () => Promise.resolve({}),
}));
vi.mock("@stripe/react-stripe-js", async () => {
  const { useEffect } = await import("react");
  return {
    Elements: ({ children }: { children: React.ReactNode }) => children,
    PaymentElement: ({ onReady }: { onReady: () => void }) => {
      useEffect(onReady, [onReady]);
      return <div>Modulo sicuro carta</div>;
    },
    useStripe: () => ({ confirmSetup }),
    useElements: () => ({}),
  };
});

const summary = {
  subscription: {
    plan: "basic",
    name: "Basic",
    amount: 1999,
    currency: "eur",
    status: "active",
    currentPeriodEnd: 1792627200,
    cancelAtPeriodEnd: false,
  },
  paymentMethod: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
  invoices: [
    {
      id: "in_1",
      number: "2026-001",
      date: 1790035200,
      amount: 1499,
      currency: "eur",
      status: "paid",
      downloadUrl: "https://pay.stripe.com/invoice.pdf",
    },
  ],
};
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
async function saveCard() {
  const button = await screen.findByRole("button", { name: "Salva carta" });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
}
beforeEach(() => {
  window.history.replaceState(null, "", "/profile?tab=billing");
  fetchMock
    .mockReset()
    .mockImplementation(() => Promise.resolve(json(summary)));
  confirmSetup.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BillingSection", () => {
  it("shows authoritative plan, saved card and invoice download", async () => {
    render(<BillingSection />);
    expect(await screen.findByText("Basic")).toBeTruthy();
    expect(screen.getByText(/19,99/)).toBeTruthy();
    expect(screen.getByText(/4242/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Scarica PDF/ }).getAttribute("href"),
    ).toBe(summary.invoices[0].downloadUrl);
    expect(fetchMock).toHaveBeenCalledWith("/api/billing", {
      cache: "no-store",
    });
  });

  it("requires confirmation before scheduling cancellation and permits resuming", async () => {
    render(<BillingSection />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Disattiva rinnovo" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fetchMock.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(
      json({
        ...summary,
        subscription: { ...summary.subscription, cancelAtPeriodEnd: true },
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Disattiva rinnovo",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Riattiva rinnovo" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/billing",
        expect.objectContaining({ body: JSON.stringify({ action: "resume" }) }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing",
      expect.objectContaining({ body: JSON.stringify({ action: "cancel" }) }),
    );
  });

  it("saves a card inline only after Stripe confirms it and server accepts ownership", async () => {
    render(<BillingSection />);
    await screen.findByText("Basic");
    fetchMock.mockResolvedValueOnce(json({ clientSecret: "seti_secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambia carta" }));
    confirmSetup.mockResolvedValue({
      setupIntent: { id: "seti_123", status: "succeeded" },
    });
    await saveCard();
    expect(await screen.findByText("Carta aggiornata.")).toBeTruthy();
    expect(confirmSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/profile?tab=billing`,
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing",
      expect.objectContaining({
        body: JSON.stringify({
          action: "confirm_payment_method",
          setupIntentId: "seti_123",
        }),
      }),
    );
  });

  it("keeps Stripe errors visible without claiming card success", async () => {
    render(<BillingSection />);
    await screen.findByText("Basic");
    fetchMock.mockResolvedValueOnce(json({ clientSecret: "seti_secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambia carta" }));
    confirmSetup.mockResolvedValue({ error: { message: "Carta rifiutata" } });
    await saveCard();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Carta rifiutata",
    );
    expect(screen.queryByText("Carta aggiornata.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["confirmation", "summary"])(
    "retries a confirmed card after failed server %s without confirming Stripe twice",
    async (failure) => {
      render(<BillingSection />);
      await screen.findByText("Basic");
      fetchMock.mockResolvedValueOnce(json({ clientSecret: "seti_secret" }));
      fireEvent.click(screen.getByRole("button", { name: "Cambia carta" }));
      await screen.findByRole("button", { name: "Salva carta" });
      confirmSetup.mockResolvedValue({
        setupIntent: { id: "seti_123", status: "succeeded" },
      });
      if (failure === "summary")
        fetchMock.mockResolvedValueOnce(json({ ok: true }));
      fetchMock.mockResolvedValueOnce(json({}, 503));
      await saveCard();
      await screen.findByRole("alert");
      fetchMock
        .mockResolvedValueOnce(json({ ok: true }))
        .mockResolvedValueOnce(json(summary));
      fireEvent.click(
        screen.getByRole("button", { name: "Riprova salvataggio" }),
      );
      expect(await screen.findByText("Carta aggiornata.")).toBeTruthy();
      expect(confirmSetup).toHaveBeenCalledTimes(1);
      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.body ===
            JSON.stringify({
              action: "confirm_payment_method",
              setupIntentId: "seti_123",
            }),
        ),
      ).toHaveLength(2);
    },
  );

  it.each(["failed", "canceled", "requires_payment_method"])(
    "recovers from a %s card verification return",
    async (status) => {
      window.history.replaceState(
        null,
        "",
        `/profile?tab=billing&setup_intent=seti_return&setup_intent_client_secret=secret&redirect_status=${status}`,
      );
      render(<BillingSection />);
      expect(await screen.findByText("Basic")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain(
        "verifica della carta non è stata completata",
      );
      expect(screen.queryByText("Carta aggiornata.")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe("?tab=billing");
      fetchMock.mockResolvedValueOnce(
        json({ clientSecret: "seti_new_secret" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Cambia carta" }));
      expect(
        await screen.findByRole("button", { name: "Salva carta" }),
      ).toBeTruthy();
    },
  );

  it.each(["succeeded", ""])(
    "keeps a %s return retryable when the ownership confirmation fails",
    async (status) => {
      window.history.replaceState(
        null,
        "",
        `/profile?tab=billing&setup_intent=seti_return${status ? `&redirect_status=${status}` : ""}`,
      );
      fetchMock.mockResolvedValueOnce(json({}, 503));
      render(<BillingSection />);
      expect(await screen.findByText("Basic")).toBeTruthy();
      expect(screen.queryByText("Carta aggiornata.")).toBeNull();
      expect(window.location.search).toContain("setup_intent=seti_return");
      fetchMock
        .mockResolvedValueOnce(json({ ok: true }))
        .mockResolvedValueOnce(json(summary));
      fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
      expect(await screen.findByText("Carta aggiornata.")).toBeTruthy();
      await waitFor(() => expect(window.location.search).toBe("?tab=billing"));
      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.body ===
            JSON.stringify({
              action: "confirm_payment_method",
              setupIntentId: "seti_return",
            }),
        ),
      ).toHaveLength(2);
    },
  );

  it.each(["incomplete", "unpaid", "paused"])(
    "does not offer unsupported renewal changes for %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        json({ ...summary, subscription: { ...summary.subscription, status } }),
      );
      render(<BillingSection />);
      await screen.findByText("Basic");
      expect(
        screen.queryByRole("button", { name: "Disattiva rinnovo" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Riattiva rinnovo" }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Cambia carta" })).toBeTruthy();
    },
  );

  it("reconciles checkout return without treating the query as proof of access", async () => {
    window.history.replaceState(
      null,
      "",
      "/profile?tab=billing&checkout=complete",
    );
    fetchMock
      .mockResolvedValueOnce(json({ status: "pending" }))
      .mockResolvedValueOnce(
        json({ subscription: null, paymentMethod: null, invoices: [] }),
      );
    render(<BillingSection />);
    expect(
      await screen.findByText("Non hai un abbonamento personale attivo."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vedi i piani" })).toBeTruthy();
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ action: "refresh" }),
    );
  });

  it("checks returned SetupIntent on the server and clears its URL secret after success", async () => {
    window.history.replaceState(
      null,
      "",
      "/profile?tab=billing&setup_intent=seti_return&setup_intent_client_secret=secret&redirect_status=succeeded",
    );
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    render(<BillingSection />);
    expect(await screen.findByText("Basic")).toBeTruthy();
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({
        action: "confirm_payment_method",
        setupIntentId: "seti_return",
      }),
    );
    expect(window.location.search).toBe("?tab=billing");
  });

  it("offers retry when loading fails", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    render(<BillingSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Basic")).toBeTruthy();
  });
});
