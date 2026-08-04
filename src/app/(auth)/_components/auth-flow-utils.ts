type ClerkErrorLike = {
  code?: string;
  message?: string;
  longMessage?: string;
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
};

export const AUTH_REQUEST_TIMEOUT_MS = 15_000;
export const AUTH_REQUEST_TIMEOUT_MESSAGE =
  "La verifica di sicurezza non ha risposto. Ricarica la pagina e riprova.";

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super(AUTH_REQUEST_TIMEOUT_MESSAGE);
    this.name = "AuthRequestTimeoutError";
  }
}

export function withAuthRequestTimeout<T>(
  operation: Promise<T>,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new AuthRequestTimeoutError());
    }, timeoutMs);

    operation.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function getUnknownAuthErrorMessage(
  error: unknown,
  fallback = "Non è stato possibile completare la richiesta. Riprova.",
): string {
  if (error instanceof AuthRequestTimeoutError) return error.message;
  if (!error || typeof error !== "object") return fallback;
  return getAuthErrorMessage(error as ClerkErrorLike, fallback);
}

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [
    /identifier.*not.*found|form_identifier_not_found/i,
    "Non troviamo un account con questa email.",
  ],
  [
    /password.*incorrect|form_password_incorrect/i,
    "La password non è corretta.",
  ],
  [
    /password.*pwned|password.*compromised/i,
    "Questa password compare in una violazione nota. Scegline un’altra.",
  ],
  [
    /password.*length|too_short/i,
    "La password deve contenere almeno 8 caratteri.",
  ],
  [
    /identifier.*exists|already.*exists/i,
    "Esiste già un account con questa email.",
  ],
  [
    /code.*incorrect|verification.*failed/i,
    "Il codice non è corretto o è scaduto.",
  ],
  [/captcha/i, "La verifica di sicurezza non è riuscita. Riprova."],
  [
    /rate.*limit|too_many/i,
    "Hai effettuato troppi tentativi. Attendi qualche minuto.",
  ],
];

function localizedMessageForCode(code?: string): string | null {
  if (!code) return null;
  return ERROR_MESSAGES.find(([pattern]) => pattern.test(code))?.[1] ?? null;
}

export function getAuthErrorMessage(
  error: ClerkErrorLike | null | undefined,
  fallback = "Non è stato possibile completare la richiesta. Riprova.",
): string {
  const nestedError = error?.errors?.[0];
  return localizedMessageForCode(nestedError?.code ?? error?.code) ?? fallback;
}

export function getFieldErrorMessage(
  error: ClerkErrorLike | null | undefined,
): string | null {
  if (!error) return null;
  return (
    localizedMessageForCode(error.code) ?? "Controlla questo campo e riprova."
  );
}

export function navigateAfterAuth(
  router: { replace: (href: string) => void },
  destination: string,
  decorateUrl: (url: string) => string,
) {
  const decorated = decorateUrl(destination);
  if (decorated.startsWith("http://") || decorated.startsWith("https://")) {
    window.location.assign(decorated);
    return;
  }

  router.replace(decorated);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
