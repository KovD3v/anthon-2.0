import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/app/api/**/route.integration.test.ts"],
    environment: "node",
    globals: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    globalSetup: ["src/test/integration/global-setup.ts"],
    setupFiles: ["src/test/integration/setup.ts"],
  },
});
