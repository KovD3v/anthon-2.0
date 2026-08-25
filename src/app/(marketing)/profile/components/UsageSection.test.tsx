// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageData } from "@/types/chat";
import { UsageSection } from "./UsageSection";

const usage: UsageData = {
  usage: {
    requestCount: 13,
    inputTokens: 1200,
    outputTokens: 400,
    totalCostUsd: 0.12,
  },
  limits: {
    maxRequests: 50,
    maxInputTokens: 500_000,
    maxOutputTokens: 250_000,
    maxCostUsd: 3,
  },
  tier: "BASIC_PLUS",
  subscriptionStatus: "ACTIVE",
  entitlements: {
    modelTier: "BASIC_PLUS",
    sources: [],
  },
};

describe("UsageSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the current plan and daily message allowance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UsageSection />);

    expect(await screen.findByText("37 rimasti su 50")).toBeTruthy();
    expect(screen.getByText("13 utilizzati")).toBeTruthy();
    expect(screen.getByText("Basic Plus")).toBeTruthy();

    const progress = screen.getByRole("progressbar", {
      name: "Messaggi utilizzati",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("13");
    expect(progress.getAttribute("aria-valuemax")).toBe("50");
    expect(
      screen.getByRole("link", { name: "Vedi i piani" }).getAttribute("href"),
    ).toBe("/pricing");
    expect(fetchMock).toHaveBeenCalledWith("/api/usage", {
      cache: "no-store",
    });
  });

  it("contains a local error without hiding the section", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<UsageSection />);

    expect(
      await screen.findByText("Impossibile caricare l'utilizzo."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Utilizzo" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows the pricing action when paid access is required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Paid access required",
            upgradeUrl: "/pricing",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<UsageSection />);

    expect(
      await screen.findByText(
        "Per continuare a usare Anthon, scegli un piano.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Vedi i piani" }).getAttribute("href"),
    ).toBe("/pricing");
    expect(screen.queryByText("Riprova tra qualche istante.")).toBeNull();
  });

  it("keeps an empty allowance at zero without an invalid progress value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...usage,
          limits: { ...usage.limits, maxRequests: 0 },
        }),
      }),
    );

    render(<UsageSection />);

    expect(await screen.findByText("0 rimasti su 0")).toBeTruthy();
    const progress = screen.getByRole("progressbar", {
      name: "Messaggi utilizzati",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("0");
    expect(
      progress.querySelector<HTMLElement>("[data-slot='progress-indicator']")
        ?.style.transform,
    ).toBe("scaleX(0)");
  });

  it("does not propose an upgrade on the Pro plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...usage, tier: "PRO" }),
      }),
    );

    render(<UsageSection />);

    expect(await screen.findByText("Pro")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Vedi i piani" })).toBeNull();
  });
});
