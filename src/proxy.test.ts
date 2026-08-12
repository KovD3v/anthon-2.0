import type { NextRequest } from "next/server";
import { NextRequest as TestRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (
    handler: (
      auth: () => Promise<{ userId: string | null }>,
      request: NextRequest,
    ) => Promise<Response>,
  ) => handler,
}));

import proxy from "./proxy";

describe("proxy", () => {
  it("returns a real 404 for the retired usage route without authenticating or redirecting", async () => {
    const auth = vi.fn().mockResolvedValue({ userId: "user-1" });
    const request = new TestRequest("http://localhost:3000/chat/usage");

    const response = await proxy(auth, request);

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });
});
