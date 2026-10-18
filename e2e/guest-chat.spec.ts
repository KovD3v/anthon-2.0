import { expect, type Page, test } from "@playwright/test";
import type { ChatData } from "../src/types/chat";

async function openEmptyGuestChat(page: Page) {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Benvenuto!" })).toBeVisible();

  await expect(
    page.getByRole("textbox", { name: "Scrivi un messaggio" }),
  ).toBeEditable();
}

async function sendMessage(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
  await input.fill(text);
  await page.getByRole("button", { name: "Invia messaggio" }).click();
  await expect(page).toHaveURL(/\/chat\/[^/?#]+$/);
}

async function waitForResponsePersisted(page: Page, text: string) {
  const response = page
    .getByRole("main")
    .locator('[data-message-role="assistant"]')
    .filter({ hasText: text });
  await expect(
    response.getByRole("button", { name: "Pollice su: risposta utile" }),
  ).toBeVisible();
}

test.describe("guest chat smoke", () => {
  test("keeps the mobile launcher usable and scrolls when its content overflows", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile launcher regression");

    await openEmptyGuestChat(page);
    const heading = page.getByRole("heading", { name: "Benvenuto!" });
    const launcher = page
      .getByRole("main")
      .locator("div.overflow-y-auto")
      .filter({ has: heading });
    await expect(launcher).toHaveCount(1);
    const overflows = await launcher.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    if (overflows) {
      await launcher.hover();
      await page.mouse.wheel(0, 700);
      await expect
        .poll(() => launcher.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    } else {
      await expect(heading).toBeInViewport();
    }
    await expect(
      page.getByRole("textbox", { name: "Scrivi un messaggio" }),
    ).toBeInViewport();
  });

  test("supports consecutive turns without reloading", async ({ page }) => {
    await openEmptyGuestChat(page);

    const firstPrompt = "Primo turno consecutivo E2E";
    await sendMessage(page, firstPrompt);
    await expect(
      page
        .getByRole("main")
        .getByText("Risposta E2E completata.", { exact: true }),
    ).toBeVisible();
    await waitForResponsePersisted(page, "Risposta E2E completata.");
    const chatUrl = page.url();

    const secondPrompt = "Secondo turno consecutivo E2E";
    await sendMessage(page, secondPrompt);
    await expect(
      page
        .locator('[data-message-role="user"]')
        .getByText(secondPrompt, { exact: true }),
    ).toBeVisible();
    await waitForResponsePersisted(page, "token-119");
    await expect(page).toHaveURL(chatUrl);
    await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(
      2,
    );
    await expect(page.getByText(/React error #185/i)).toHaveCount(0);
  });

  test("streams, restores context, and persists feedback after reload", async ({
    page,
  }) => {
    await openEmptyGuestChat(page);

    const firstPrompt = "La parola chiave del test è zaffiro. Confermala.";
    const firstReply = "Ho memorizzato la parola chiave zaffiro.";
    // React streaming can stage the same markup in hidden S:* containers.
    // Assert within the accessible conversation and still reject live duplicates.
    const conversation = page.getByRole("main");
    const firstUserMessage = conversation
      .locator('[data-message-role="user"]')
      .getByText(firstPrompt, { exact: true });
    const firstAssistantMessage = conversation
      .locator('[data-message-role="assistant"]')
      .getByText(firstReply, { exact: true });
    await sendMessage(page, firstPrompt);

    await expect(firstUserMessage).toHaveCount(1);
    await expect(firstUserMessage).toBeVisible();
    await expect(firstAssistantMessage).toHaveCount(1);
    await expect(firstAssistantMessage).toBeVisible();
    await waitForResponsePersisted(
      page,
      "Ho memorizzato la parola chiave zaffiro.",
    );

    await page.reload();
    await expect(firstUserMessage).toHaveCount(1);
    await expect(firstUserMessage).toBeVisible();
    await expect(firstAssistantMessage).toHaveCount(1);
    await expect(firstAssistantMessage).toBeVisible();

    const chatId = new URL(page.url()).pathname.split("/").at(-1);
    const storedResponse = await page.request.get(`/api/guest/chats/${chatId}`);
    await expect(storedResponse).toBeOK();
    const storedChat = (await storedResponse.json()) as ChatData;
    expect(
      storedChat.messages.map(({ role, content }) => ({ role, content })),
    ).toEqual([
      { role: "user", content: firstPrompt },
      { role: "assistant", content: firstReply },
    ]);

    await sendMessage(page, "Qual era la parola chiave?");
    await expect(
      conversation.getByText("La parola chiave era zaffiro.", { exact: true }),
    ).toBeVisible();

    const contextualResponse = conversation
      .locator('[data-message-role="assistant"]')
      .filter({ hasText: "La parola chiave era zaffiro." });
    const usefulButton = contextualResponse.getByRole("button", {
      name: "Pollice su: risposta utile",
    });
    const feedbackResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/guest/chat/feedback") &&
        response.request().method() === "POST",
    );
    await usefulButton.click();
    await expect((await feedbackResponse).status()).toBe(200);
    await expect(usefulButton).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(firstUserMessage).toHaveCount(1);
    await expect(
      conversation.locator('[data-message-role="user"]'),
    ).toHaveCount(2);
    await expect(
      conversation.locator('[data-message-role="assistant"]'),
    ).toHaveCount(2);
    const restoredContextualResponse = conversation
      .locator('[data-message-role="assistant"]')
      .filter({ hasText: "La parola chiave era zaffiro." });
    await expect(
      restoredContextualResponse.getByRole("button", {
        name: "Pollice su: risposta utile",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("recovers after interruption and a retryable request failure", async ({
    page,
  }) => {
    await openEmptyGuestChat(page);

    await sendMessage(page, "risposta-lenta-e2e");
    const stopButton = page.getByRole("button", {
      name: "Interrompi risposta",
    });
    await expect(stopButton).toBeVisible();
    await stopButton.click();
    await expect(
      page.getByRole("button", { name: "Invia messaggio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Scrivi un messaggio" }),
    ).toBeEnabled();

    let failedOnce = false;
    await page.route("**/api/guest/chat", async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Errore E2E recuperabile" }),
        });
        return;
      }
      await route.continue();
    });

    await sendMessage(page, "Questo invio deve fallire una volta");
    await expect(page.getByText("Errore E2E recuperabile")).toBeVisible();

    await page.unroute("**/api/guest/chat");
    await sendMessage(page, "recupero-e2e");
    await expect(
      page
        .getByRole("main")
        .getByText("Il flusso è di nuovo operativo.", { exact: true }),
    ).toBeVisible();
  });
});
