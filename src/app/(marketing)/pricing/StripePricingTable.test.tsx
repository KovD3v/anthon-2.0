// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  STRIPE_TEST_PLANS,
  type StripePlanKey,
} from "@/lib/billing/stripe-catalog";
import { StripePricingTable } from "./StripePricingTable";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true }),
}));
afterEach(cleanup);

it("offers three monthly and three annual plans with exact checkout links and upfront totals", async () => {
  const user = userEvent.setup();
  const plans = Object.entries(STRIPE_TEST_PLANS).map(([key, plan]) => ({
    ...plan,
    key: key as StripePlanKey,
    features: [],
  }));
  render(<StripePricingTable plans={plans} testMode={false} />);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: "Scegli Pro" }).getAttribute("href"),
  ).toBe("/checkout?plan=pro");
  expect(screen.getByText(/LANCIO5/)).toBeTruthy();
  expect(screen.queryByText(/Ambiente di test/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Annuale" }));
  expect(
    screen
      .getByRole("button", { name: "Annuale" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: "Scegli Pro" }).getAttribute("href"),
  ).toBe("/checkout?plan=pro_annual");
  expect(screen.getByText(/499,99/)).toBeTruthy();
  expect(
    screen.getAllByText("Un unico addebito annuale anticipato."),
  ).toHaveLength(3);
  expect(screen.queryByText(/LANCIO5/)).toBeNull();
});
