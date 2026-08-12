// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaServiceWorker } from "./pwa-service-worker";

describe("PwaServiceWorker", () => {
  afterEach(() => {
    cleanup();
  });

  it("registers the root service worker without HTTP cache reuse", async () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    render(<PwaServiceWorker />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    });
  });
});
