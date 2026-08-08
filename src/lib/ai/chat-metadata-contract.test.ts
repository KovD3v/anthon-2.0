import { describe, expect, it } from "vitest";
import { CHAT_ICON_KEYS, normalizeChatIcon } from "@/lib/chat-icons";
import {
  buildChatMetadataContext,
  buildChatMetadataPrompt,
  chatMetadataSchema,
} from "./chat-metadata-contract";

describe("chat metadata contract", () => {
  it("accepts only the approved icon vocabulary", () => {
    expect(CHAT_ICON_KEYS).toHaveLength(14);
    expect(
      chatMetadataSchema.parse({
        title: "Reset dopo un errore",
        icon: "REFRESH_CCW",
      }),
    ).toEqual({
      title: "Reset dopo un errore",
      icon: "REFRESH_CCW",
    });
    expect(() =>
      chatMetadataSchema.parse({
        title: "Reset dopo errore",
        icon: "ROTATE_CW",
      }),
    ).toThrow();
    expect(() =>
      chatMetadataSchema.parse({
        title: "Reset immediato",
        icon: "REFRESH_CCW",
      }),
    ).toThrow();
  });

  it("normalizes unknown runtime icon values to the neutral fallback", () => {
    expect(normalizeChatIcon("TARGET")).toBe("TARGET");
    expect(normalizeChatIcon("UNKNOWN")).toBe("MESSAGE_SQUARE");
    expect(normalizeChatIcon(null)).toBe("MESSAGE_SQUARE");
  });

  it("keeps the first user need and bounded recent context", () => {
    const context = buildChatMetadataContext(
      [
        {
          role: "user",
          text: "Ho paura di sbagliare il rigore decisivo",
        },
        { role: "assistant", text: "x".repeat(2_000) },
        {
          role: "user",
          text: "Mi serve una routine di trenta secondi",
        },
      ],
      "Ho paura di sbagliare il rigore decisivo",
    );

    expect(context).toContain(
      "PRIMO BISOGNO UTENTE: Ho paura di sbagliare il rigore decisivo",
    );
    expect(context).toContain("USER: Mi serve una routine di trenta secondi");
    expect(
      context.match(/Ho paura di sbagliare il rigore decisivo/g),
    ).toHaveLength(1);
    expect(context.length).toBeLessThanOrEqual(1_600);
  });

  it("bounds an unusually long first user message", () => {
    const context = buildChatMetadataContext(
      [{ role: "user", text: `pressione ${"x".repeat(3_000)}` }],
      "",
    );

    expect(context.length).toBeLessThanOrEqual(1_600);
    expect(context).toContain("PRIMO BISOGNO UTENTE: pressione");
  });

  it("requires specific Italian titles and documents every icon", () => {
    const prompt = buildChatMetadataPrompt(
      "USER: Voglio preparare la maratona",
    );

    expect(prompt).toContain("3-6 parole");
    expect(prompt).toContain("massimo 55 caratteri");
    expect(prompt).toContain("Evita titoli generici");
    for (const icon of CHAT_ICON_KEYS) {
      expect(prompt).toContain(icon);
    }
  });
});
