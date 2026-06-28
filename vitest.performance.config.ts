import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/test/performance/**/*.performance.test.ts"],
    environment: "node",
    globals: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
