import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Anthon — AI Mental Coach",
    short_name: "Anthon",
    description: "Il tuo mental coach personale basato sull'IA.",
    lang: "it-IT",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#151512",
    theme_color: "#151512",
    categories: ["lifestyle", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
