import { expect, test } from "@playwright/test";
import { authenticateE2EPage, E2E_ACCESS_USERS } from "./authenticated-chat";

test.describe("authenticated access lifecycle", () => {
  test.skip(({ isMobile }) => isMobile, "Access lifecycle runs on desktop");
  test.describe.configure({ mode: "serial", retries: 0 });

  test("keeps existing history readable without paid access", async ({
    page,
  }) => {
    await authenticateE2EPage(page, E2E_ACCESS_USERS.noAccess.clerkId);
    await page.goto(`/chat/${E2E_ACCESS_USERS.noAccess.chatId}`);

    await expect(
      page.getByText("Il messaggio resta mio anche senza un piano.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("La cronologia resta disponibile.", { exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByText("La cronologia resta disponibile.", { exact: true }),
    ).toBeVisible();
  });

  test("blocks a new coaching turn without hiding existing history", async ({
    page,
  }) => {
    await authenticateE2EPage(page, E2E_ACCESS_USERS.noAccess.clerkId);
    await page.goto(`/chat/${E2E_ACCESS_USERS.noAccess.chatId}`);

    const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
    await input.fill("Questo turno richiede un piano");
    await page.getByRole("button", { name: "Invia messaggio" }).click();

    await expect(
      page.getByText("Accesso richiesto", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Vedi i piani" }),
    ).toHaveAttribute("href", "/pricing");
    await expect(
      page.getByText("La cronologia resta disponibile.", { exact: true }),
    ).toBeVisible();
  });

  test("allows a paid account to continue coaching", async ({ page }) => {
    await authenticateE2EPage(page, E2E_ACCESS_USERS.paid.clerkId);
    await page.goto(`/chat/${E2E_ACCESS_USERS.paid.chatId}`);

    const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
    await input.fill("Il piano attivo continua il coaching E2E");
    await page.getByRole("button", { name: "Invia messaggio" }).click();

    await expect(
      page.getByText("Risposta E2E completata.", { exact: true }),
    ).toBeVisible();
  });

  test("keeps history but blocks coaching after an organization seat is removed", async ({
    page,
  }) => {
    await authenticateE2EPage(page, E2E_ACCESS_USERS.removedSeat.clerkId);
    await page.goto(`/chat/${E2E_ACCESS_USERS.removedSeat.chatId}`);

    await expect(
      page
        .getByText("Questa chat precede la rimozione del posto.", {
          exact: true,
        })
        .last(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByText("I dati restano accessibili al titolare.", {
          exact: true,
        })
        .last(),
    ).toBeVisible();

    const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
    await input.fill("Il posto rimosso non deve concedere coaching");
    await page.getByRole("button", { name: "Invia messaggio" }).click();
    await expect(
      page.getByText("Accesso richiesto", { exact: true }),
    ).toBeVisible();
  });
});
