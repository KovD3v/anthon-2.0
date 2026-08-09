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
      page.getByText(/Ripeti questa routine senza modificarla/),
    ).toBeVisible();
    await expect(
      page.getByText("Risposta E2E routine ripetuta.", { exact: true }),
    ).toBeVisible();

    await page.goto("/chat/routines");
    await page.reload();
    await expect(
      page.getByTestId(/routine-card-/).filter({ hasText: ROUTINE_TITLE }),
    ).toBeVisible();
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
