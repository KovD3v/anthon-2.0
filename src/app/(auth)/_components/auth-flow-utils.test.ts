import { describe, expect, it, vi } from "vitest";
import {
  AUTH_REQUEST_TIMEOUT_MESSAGE,
  AuthRequestTimeoutError,
  getAuthErrorMessage,
  getFieldErrorMessage,
  maskEmail,
  withAuthRequestTimeout,
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

  it("rejects stalled auth requests with a user-facing timeout", async () => {
    vi.useFakeTimers();
    const pendingRequest = withAuthRequestTimeout(
      new Promise<never>(() => {}),
      100,
    );
    const rejection = expect(pendingRequest).rejects.toBeInstanceOf(
      AuthRequestTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(new AuthRequestTimeoutError().message).toBe(
      AUTH_REQUEST_TIMEOUT_MESSAGE,
    );
    vi.useRealTimers();
  });
});
