import { expect, test } from "@playwright/test";
import { authenticateE2EPage, E2E_ACCESS_USERS } from "./authenticated-chat";

test.describe("mobile onboarding input", () => {
  test.skip(({ isMobile }) => !isMobile, "Mobile onboarding regression");
  test.describe.configure({ retries: 0 });

  test.beforeEach(async ({ page }) => {
    await authenticateE2EPage(page, E2E_ACCESS_USERS.onboarding.clerkId);
    await page.goto("/onboarding");
    await expect(
      page.getByRole("textbox", { name: "La tua risposta" }),
    ).toBeVisible();
  });

  test("Enter adds a new line without submitting", async ({ page }) => {
    let answerRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/onboarding/answer") {
        answerRequests += 1;
      }
    });
    const input = page.getByRole("textbox", { name: "La tua risposta" });

    await input.fill("Prima riga");
    await input.press("Enter");
    await input.type("Seconda riga");

    await expect(input).toHaveValue("Prima riga\nSeconda riga");
    await expect.poll(() => answerRequests, { timeout: 500 }).toBe(0);
    await expect(
      page.getByText("Passaggio 1 di 5", { exact: true }),
    ).toBeVisible();
  });

  test("the explicit send button advances to the next question", async ({
    page,
  }) => {
    await page.route("**/api/onboarding/answer", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "IN_PROGRESS",
          currentStep: 1,
          totalSteps: 5,
          currentField: "age",
          question: "Quanti anni hai?",
          skipLabel: "Preferisco non dirlo",
          draft: {
            name: "Giulia",
            age: null,
            occupation: null,
            sport: null,
            experience: null,
            goal: null,
          },
          skippedFields: [],
          messages: [
            {
              id: "question-1",
              role: "assistant",
              content: "Come vuoi che ti chiami?",
            },
            { id: "answer-1", role: "user", content: "Giulia" },
            {
              id: "question-2",
              role: "assistant",
              content: "Quanti anni hai?",
            },
          ],
        }),
      });
    });

    await page.getByRole("textbox", { name: "La tua risposta" }).fill("Giulia");
    await page.getByRole("button", { name: "Invia risposta" }).press("Enter");

    await expect(
      page.getByText("Passaggio 2 di 5", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Quanti anni hai?", { exact: true }),
    ).toBeVisible();
  });
});
