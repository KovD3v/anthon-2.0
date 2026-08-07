import { defineConfig, devices } from "@playwright/test";

const isInstantNavRig = process.env.INSTANT_NAV_RIG === "1";
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  (isInstantNavRig ? "http://localhost:3200" : "http://localhost:3100");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  outputDir: "output/playwright/test-results",
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun e2e/mock-openrouter.ts",
      url: "http://127.0.0.1:4317/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: isInstantNavRig
        ? "bun run start --hostname localhost --port 3200"
        : "bun run dev --hostname localhost --port 3100",
      url: `${appUrl}/chat`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
});
