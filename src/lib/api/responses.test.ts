import { describe, expect, it } from "vitest";
import {
  badRequest,
  forbidden,
  jsonCreated,
  jsonOk,
  notFound,
  rateLimited,
  serverError,
  unauthorized,
} from "./responses";

describe("api/responses", () => {
  it("returns success responses with expected status codes", async () => {
    const ok = jsonOk({ hello: "world" });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ hello: "world" });

    const created = jsonCreated({ id: "1" });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ id: "1" });
  });

  it("includes extra payload fields when provided", async () => {
    const bad = badRequest("Invalid input", { field: "email" });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toEqual({
      error: "Invalid input",
      field: "email",
    });

    const limited = rateLimited("Too many", { retryAfter: 60 });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "Too many",
      retryAfter: 60,
    });
  });

  it("returns default and custom client/server error messages", async () => {
    await expect(unauthorized().json()).resolves.toEqual({
      error: "Unauthorized",
    });
    expect(unauthorized().status).toBe(401);

    await expect(forbidden("No access").json()).resolves.toEqual({
      error: "No access",
    });
    expect(forbidden().status).toBe(403);

    await expect(notFound().json()).resolves.toEqual({ error: "Not found" });
    expect(notFound().status).toBe(404);

    await expect(serverError().json()).resolves.toEqual({
      error: "Internal server error",
    });
    expect(serverError().status).toBe(500);
  });
});
