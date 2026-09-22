// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutClient, CheckoutForm } from "./CheckoutClient";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  client: vi.fn(),
  confirm: vi.fn(),
  apply: vi.fn(),
  remove: vi.fn(),
  checkout: { current: {} as Record<string, unknown> },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/lib/billing/stripe-client", () => ({
  getStripeTestClient: mocks.client,
}));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useCheckoutElements: () => ({
    type: "success",
    checkout: mocks.checkout.current,
  }),
  ContactDetailsElement: () => <div>Email Stripe</div>,
  PaymentElement: () => <div>Carta Stripe</div>,
}));

const plan = { key: "basic" as const, name: "Basic", amount: 1999 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue(null);
  mocks.checkout.current = {
    livemode: false,
    currency: "eur",
    canConfirm: true,
    total: { total: { amount: "14,99 €" } },
    recurring: { dueNext: { total: { amount: "19,99 €" } } },
    discountAmounts: [
      { promotionCode: "LANCIO5", displayName: "Lancio", amount: "5,00 €" },
    ],
    confirm: mocks.confirm,
    applyPromotionCode: mocks.apply,
    removePromotionCode: mocks.remove,
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Custom test checkout", () => {
  it("does not create a checkout without a test publishable key", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<CheckoutClient plan={plan} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "non è ancora configurato",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("displays initial and recurring totals and applies/removes Stripe discounts", async () => {
    mocks.apply.mockResolvedValue({
      type: "error",
      error: { message: "Codice scaduto" },
    });
    mocks.remove.mockResolvedValue({ type: "success" });
    const user = userEvent.setup();
    render(<CheckoutForm plan={plan} />);
    expect(
      screen.getByText("Totale oggi").nextElementSibling?.textContent,
    ).toBe("14,99 €");
    expect(
      screen.getByText("Dal prossimo mese").nextElementSibling?.textContent,
    ).toBe("19,99 €");
    await user.type(screen.getByLabelText("Codice promozionale"), "SCADUTO");
    await user.click(screen.getByRole("button", { name: "Applica" }));
    expect(mocks.apply).toHaveBeenCalledWith("SCADUTO");
    expect(screen.getByRole("alert").textContent).toBe("Codice scaduto");
    await user.click(screen.getByRole("button", { name: "Rimuovi codice" }));
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("keeps payment errors in place, then returns to server-backed billing confirmation", async () => {
    mocks.confirm
      .mockResolvedValueOnce({
        type: "error",
        error: { message: "Carta rifiutata" },
      })
      .mockResolvedValueOnce({ type: "success" });
    const user = userEvent.setup();
    render(<CheckoutForm plan={plan} />);
    await user.click(screen.getByRole("button", { name: /Abbonati/ }));
    expect(screen.getByRole("alert").textContent).toBe("Carta rifiutata");
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Abbonati/ }));
    expect(mocks.confirm).toHaveBeenCalledWith({
      redirect: "if_required",
      returnUrl: `${window.location.origin}/profile?tab=billing&checkout=complete`,
    });
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/profile?tab=billing&checkout=complete",
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refuses live or non-EUR checkout sessions", () => {
    mocks.checkout.current.currency = "usd";
    render(<CheckoutForm plan={plan} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Abbonati/ })).toBeNull();
  });
});
