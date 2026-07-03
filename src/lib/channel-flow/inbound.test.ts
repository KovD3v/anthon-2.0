import { describe, expect, it } from "vitest";
import { buildExternalChannelInbound } from "./inbound";

describe("channel-flow/inbound", () => {
  it("builds the same text-first AI input for transcribed voice messages", () => {
    const result = buildExternalChannelInbound({
      text: "nota",
      transcribedText: "trascrizione",
      voiceInstruction:
        "NOTA: l'utente ha inviato un messaggio vocale. Usa la TRASCRIZIONE qui sotto.",
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questo file.",
      files: [],
    });

    expect(result.userMessageText).toBe(
      "nota\n\nNOTA: l'utente ha inviato un messaggio vocale. Usa la TRASCRIZIONE qui sotto.\n\n[Trascrizione audio]\ntrascrizione",
    );
    expect(result.parts).toEqual([
      {
        type: "text",
        text: result.userMessageText,
      },
    ]);
  });

  it("does not interpolate null voice instructions for transcript-only input", () => {
    const result = buildExternalChannelInbound({
      text: "",
      transcribedText: "trascrizione",
      voiceInstruction: null,
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questo file.",
      files: [],
    });

    expect(result.userMessageText).toBe("[Trascrizione audio]\ntrascrizione");
    expect(result.parts).toEqual([
      {
        type: "text",
        text: "[Trascrizione audio]\ntrascrizione",
      },
    ]);
  });

  it("keeps text before files for multimodal messages", () => {
    const result = buildExternalChannelInbound({
      text: "valuta questa posizione",
      transcribedText: null,
      voiceInstruction: null,
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questa immagine.",
      files: [
        {
          type: "file",
          mimeType: "image/jpeg",
          data: "image-base64",
        },
      ],
    });

    expect(result.userMessageText).toBe("valuta questa posizione");
    expect(result.parts).toEqual([
      { type: "text", text: "valuta questa posizione" },
      { type: "file", mimeType: "image/jpeg", data: "image-base64" },
    ]);
  });

  it("keeps transcript text before image files", () => {
    const result = buildExternalChannelInbound({
      text: "nota",
      transcribedText: "trascrizione",
      voiceInstruction: "Usa la trascrizione del vocale.",
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questa immagine.",
      files: [
        {
          type: "file",
          mimeType: "image/jpeg",
          data: "image-base64",
        },
      ],
    });

    expect(result.parts).toEqual([
      {
        type: "text",
        text: "nota\n\nUsa la trascrizione del vocale.\n\n[Trascrizione audio]\ntrascrizione",
      },
      { type: "file", mimeType: "image/jpeg", data: "image-base64" },
    ]);
  });

  it("adds a default prompt before media-only files", () => {
    const result = buildExternalChannelInbound({
      text: "",
      transcribedText: null,
      voiceInstruction: null,
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questa immagine.",
      files: [
        {
          type: "file",
          mimeType: "image/png",
          data: "image-base64",
        },
      ],
    });

    expect(result.userMessageText).toBe("L'utente ha inviato questa immagine.");
    expect(result.parts).toEqual([
      { type: "text", text: "L'utente ha inviato questa immagine." },
      { type: "file", mimeType: "image/png", data: "image-base64" },
    ]);
  });

  it("preserves explicit context text for media-only documents", () => {
    const result = buildExternalChannelInbound({
      text: "",
      transcribedText: null,
      voiceInstruction: null,
      fallbackText: "Messaggio vocale",
      defaultMediaPrompt: "L'utente ha inviato questo file.",
      files: [
        { type: "text", text: "L'utente ha inviato il file: scheda.pdf" },
        {
          type: "file",
          mimeType: "application/pdf",
          data: "pdf-base64",
        },
      ],
    });

    expect(result.parts).toEqual([
      { type: "text", text: "L'utente ha inviato il file: scheda.pdf" },
      { type: "file", mimeType: "application/pdf", data: "pdf-base64" },
    ]);
  });
});
