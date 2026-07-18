import { defineConfig, devices } from "@playwright/test";

const ephemeralBranchId = process.env.E2E_EPHEMERAL_BRANCH_ID?.trim();
if (!ephemeralBranchId?.startsWith("br-")) {
  throw new Error(
    "E2E_EPHEMERAL_BRANCH_ID is required. Run `bun run test:e2e` so the suite uses an isolated Neon branch.",
  );
}

const appUrl = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
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
      command: "bun run dev --hostname localhost --port 3100",
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
