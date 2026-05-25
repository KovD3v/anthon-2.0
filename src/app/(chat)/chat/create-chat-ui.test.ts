import { describe, expect, it } from "vitest";
import { getCreateChatButtonState } from "./create-chat-ui";

describe("getCreateChatButtonState", () => {
  it("keeps the button interactive while idle", () => {
    expect(
      getCreateChatButtonState({
        isCreating: false,
        idleLabel: "Nuova Chat",
      }),
    ).toEqual({
      icon: "idle",
      isDisabled: false,
      label: "Nuova Chat",
    });
  });

  it("shows immediate pending feedback while creating a chat", () => {
    expect(
      getCreateChatButtonState({
        isCreating: true,
        idleLabel: "Inizia una nuova conversazione",
      }),
    ).toEqual({
      icon: "loading",
      isDisabled: true,
      label: "Creazione...",
    });
  });
});
