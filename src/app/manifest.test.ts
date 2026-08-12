import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("opens the installed app directly in Anthon chat", () => {
    const value = manifest();

    expect(value).toMatchObject({
      id: "/",
      short_name: "Anthon",
      start_url: "/chat",
      scope: "/",
      display: "standalone",
      background_color: "#151512",
      theme_color: "#151512",
    });
  });

  it("provides install and maskable icons", () => {
    const icons = manifest().icons ?? [];

    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon-192.png",
          sizes: "192x192",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-512.png",
          sizes: "512x512",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });
});
