import { instant } from "@next/playwright";
import { expect, type Page, test } from "@playwright/test";

const CHAT_CONVERSATION_SHELL = '[data-testid="chat-conversation-shell"]';
const CHAT_LAYOUT_SHELL = '[data-testid="chat-layout-shell"]';

async function createGuestChat(page: Page) {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Benvenuto!" })).toBeVisible();
  await page.getByRole("button", { name: "Conversazione libera" }).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);

  const chatId = new URL(page.url()).pathname.split("/").at(-1);
  if (!chatId) throw new Error("Guest chat id was not present in the URL");
  return chatId;
}

test.describe("instant navigation: guest chat conversation", () => {
  test.describe.configure({ retries: 0 });

  test("/chat link commits the conversation shell under instant()", async ({
    page,
  }) => {
    const chatId = await createGuestChat(page);
    await page.goto("/chat");

    const openSidebar = page.getByRole("button", {
      name: "Apri la barra laterale",
    });
    if (await openSidebar.isVisible()) {
      await openSidebar.click();
    }

    const trigger = page.getByTestId(`chat-link-${chatId}`);
    await expect(trigger).toBeVisible();

    await instant(page, async () => {
      await trigger.click();
      await expect(page.locator(CHAT_CONVERSATION_SHELL)).toBeVisible();
      await expect(page.getByTestId("chat-conversation-content")).toHaveCount(
        0,
      );
    });
    await expect(page.getByTestId("chat-conversation-content")).toBeVisible();
  });

  test("direct conversation load serves the shell under instant()", async ({
    browser,
  }) => {
    const baseURL = test.info().project.use.baseURL as string;
    const setupContext = await browser.newContext({ baseURL });
    const setupPage = await setupContext.newPage();
    const chatId = await createGuestChat(setupPage);
    const storageState = await setupContext.storageState();
    await setupContext.close();

    const context = await browser.newContext({ baseURL, storageState });
    const page = await context.newPage();
    await instant(
      page,
      async () => {
        await page.goto(`/chat/${chatId}`);
        await expect(page.locator(CHAT_LAYOUT_SHELL)).toBeVisible();
        await expect(page.getByTestId("chat-conversation-content")).toHaveCount(
          0,
        );
      },
      { baseURL },
    );
    await context.close();
  });
});
