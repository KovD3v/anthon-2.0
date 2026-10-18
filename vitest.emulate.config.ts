import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.emulate.test.ts"],
    environment: "node",
    globals: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    fileParallelism: false,
    globalSetup: ["src/test/emulate/global-setup.ts"],
  },
});
