import { describe, expect, it } from "vitest";
import {
  getAuthErrorMessage,
  getFieldErrorMessage,
  maskEmail,
} from "./auth-flow-utils";

describe("auth flow utilities", () => {
  it("normalizes Clerk error codes to Italian copy", () => {
    expect(
      getAuthErrorMessage({ errors: [{ code: "form_password_incorrect" }] }),
    ).toBe("La password non è corretta.");
    expect(
      getFieldErrorMessage({ code: "form_code_incorrect", message: "Wrong" }),
    ).toBe("Il codice non è corretto o è scaduto.");
  });

  it("does not leak unknown provider messages", () => {
    expect(getAuthErrorMessage({ message: "Provider internal error" })).toBe(
      "Non è stato possibile completare la richiesta. Riprova.",
    );
  });

  it("masks email addresses", () => {
    expect(maskEmail("tommaso@example.com")).toBe("to•••••@example.com");
  });
});
