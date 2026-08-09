import { expect, type Page } from "@playwright/test";
import {
  createE2ESessionValue,
  E2E_SESSION_COOKIE_NAME,
} from "../src/lib/e2e-runtime";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";

export async function authenticateE2EPage(page: Page) {
  const value = createE2ESessionValue("e2e-playwright-user");
  const url = new URL(appUrl);
  await page.context().addCookies([
    {
      name: E2E_SESSION_COOKIE_NAME,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

export async function openAuthenticatedRoutines(page: Page) {
  await authenticateE2EPage(page);
  await page.goto("/chat/routines");
  await expect(
    page.getByRole("heading", { name: "Le tue routine" }),
  ).toBeVisible();
}
