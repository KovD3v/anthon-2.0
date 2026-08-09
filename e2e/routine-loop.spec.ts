import { expect, test } from "@playwright/test";
import { openAuthenticatedRoutines } from "./authenticated-chat";

const ROUTINE_TITLE = "Routine E2E ripetibile";
const CHAT_URL_PATTERN =
  /\/chat\/(?!routines(?:[/?#]|$)|usage(?:[/?#]|$))[^/?#]+$/;

test.describe("authenticated routine loop", () => {
  test.describe.configure({ retries: 0 });

  test("repeats a routine in a new chat and keeps its card after refresh", async ({
    page,
  }) => {
    await openAuthenticatedRoutines(page);

    const card = page.getByTestId(/routine-card-/).filter({
      hasText: ROUTINE_TITLE,
    });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Ripeti" }).click();
    await expect(page).toHaveURL(CHAT_URL_PATTERN);
    await expect(
      page.getByText("Routine pronta", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("h3").filter({ hasText: ROUTINE_TITLE }),
    ).toBeVisible();
    await expect(
      page.getByText("Risposta E2E routine ripetuta.", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Ripeti questa routine senza modificarla/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^(Avvia|Ripeti) routine$/ }),
    ).toBeVisible();
    // The first invocation may not have a recorded attempt yet; both labels
    // are actions on the already-saved routine, unlike the proposal-only
    // "Salva routine" action.
    await expect(
      page.getByRole("button", { name: "Salva routine" }),
    ).toHaveCount(0);

    await page.reload();
    await expect(
      page.locator("h3").filter({ hasText: ROUTINE_TITLE }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Salva routine" }),
    ).toHaveCount(0);

    await page.goto("/chat/routines");
    await page.reload();
    await expect(
      page.getByTestId(/routine-card-/).filter({ hasText: ROUTINE_TITLE }),
    ).toBeVisible();
  });

  test("opens and interrupts the inline runner without an AI turn or attempt", async ({
    page,
  }) => {
    await openAuthenticatedRoutines(page);
    const card = page.getByTestId(/routine-card-/).filter({
      hasText: ROUTINE_TITLE,
    });
    const localRunnerRequests: string[] = [];

    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      const isAiTurn = pathname === "/api/chat";
      const isAttemptCreation =
        request.method() === "POST" &&
        /^\/api\/coaching\/routines\/[^/]+\/attempts$/.test(pathname);

      if (isAiTurn || isAttemptCreation) {
        localRunnerRequests.push(`${request.method()} ${pathname}`);
      }
    });

    await card.getByRole("button", { name: "Ripeti" }).click();
    await expect(page).toHaveURL(CHAT_URL_PATTERN);
    await expect(
      page.getByText("Routine pronta", { exact: true }),
    ).toBeVisible();
    const start = page.getByRole("button", {
      name: /^(Avvia|Ripeti) routine$/,
    });
    await expect(start).toBeVisible();
    await start.click();
    const runner = page.locator(
      'section[aria-labelledby="routine-runner-title"]',
    );
    await expect(runner).toBeVisible();
    await expect(
      runner.getByRole("paragraph").filter({ hasText: /^Passo 1 di 3$/ }),
    ).toBeVisible();
    await expect(
      runner.getByRole("progressbar", { name: "Avanzamento routine" }),
    ).toHaveAttribute("aria-valuenow", "0");

    await expect.poll(() => localRunnerRequests, { timeout: 500 }).toEqual([]);

    await runner.getByRole("button", { name: "Fatto" }).click();
    await expect(
      runner.getByRole("paragraph").filter({ hasText: /^Passo 2 di 3$/ }),
    ).toBeVisible();

    await runner.getByRole("button", { name: "Chiudi" }).click();
    const interruption = page.getByRole("alertdialog", {
      name: "Interrompere la routine?",
    });
    await expect(interruption).toBeVisible();
    await interruption.getByRole("button", { name: "Continua" }).click();
    await expect(interruption).toHaveCount(0);
    await expect(runner).toBeVisible();

    await runner.getByRole("button", { name: "Chiudi" }).click();
    await expect(interruption).toBeVisible();
    await interruption.getByRole("button", { name: "Interrompi" }).click();
    await expect(runner).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^(Avvia|Ripeti) routine$/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Tentativo segnato", { exact: true }),
    ).toHaveCount(0);
    await expect.poll(() => localRunnerRequests, { timeout: 500 }).toEqual([]);
  });

  test("opens a new Anthon chat with the routine adaptation context", async ({
    page,
  }) => {
    await openAuthenticatedRoutines(page);
    const card = page.getByTestId(/routine-card-/).filter({
      hasText: ROUTINE_TITLE,
    });

    await card.getByRole("button", { name: "Modifica" }).click();
    await expect(page).toHaveURL(CHAT_URL_PATTERN);
    await expect(
      page.getByText(/Vorrei adattare questa routine/),
    ).toBeVisible();
    await expect(
      page.getByText("Risposta E2E routine adattata.", { exact: true }),
    ).toBeVisible();
  });

  test("records a rich check-in and shows its dated history", async ({
    page,
  }) => {
    await openAuthenticatedRoutines(page);
    const card = page.getByTestId(/routine-card-/).filter({
      hasText: ROUTINE_TITLE,
    });

    await card.getByRole("button", { name: "Com'è andata?" }).click();
    await expect(
      card.getByRole("button", { name: "Aggiungi dettagli" }),
    ).toBeVisible();
    await card.getByRole("button", { name: "Aggiungi dettagli" }).click();
    await card
      .getByRole("textbox", { name: "Racconta com'è andata" })
      .fill("Ho respirato meglio e ho ritrovato il gesto successivo.");
    await card.getByRole("button", { name: "Mi ha aiutato" }).click();
    await expect(card.getByText("Esito registrato")).toBeVisible();

    await card.getByRole("button", { name: "Storico tentativi" }).click();
    await expect(card.getByText("Feedback").first()).toBeVisible();
    await expect(card.getByText(/Tentativo · .+\d{4}/).first()).toBeVisible();
    await expect(
      card.getByText(/Esito registrato · .+\d{4}/).first(),
    ).toBeVisible();
    await expect(
      card
        .getByText("Ho respirato meglio e ho ritrovato il gesto successivo.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
  });
});
