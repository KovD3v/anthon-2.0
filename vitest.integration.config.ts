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
    setupFiles: [
      "src/test/integration/setup-env.ts",
      "src/test/integration/setup.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      all: true,
      include: [
        "src/app/api/admin/organizations/route.ts",
        "src/app/api/admin/organizations/[organizationId]/route.ts",
        "src/app/api/admin/organizations/[organizationId]/audit/route.ts",
      ],
      thresholds: {
        statements: 35,
        branches: 25,
        functions: 35,
        lines: 35,
      },
    },
  },
});
