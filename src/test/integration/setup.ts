import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { prisma } from "@/lib/db";

beforeAll(() => {
  if (!process.env.INTEGRATION_TEST_SCHEMA) {
    throw new Error(
      "INTEGRATION_TEST_SCHEMA is not set. Run integration tests through vitest.integration.config.ts.",
    );
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});
