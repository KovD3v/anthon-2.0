import { createClerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "./proxy";

// Runs anthon's real clerkMiddleware. Clerk verifies the bearer session token
// with the JWKS served by the Emulate Clerk instance.
async function sessionToken() {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    apiUrl: process.env.CLERK_API_URL,
  });
  const user = await clerk.users.createUser({
    emailAddress: [`proxy-${Date.now()}@example.com`],
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  return (await clerk.sessions.getToken(session.id)).jwt;
}

async function requestProfile(token?: string) {
  const request = new NextRequest("http://localhost:3000/profile", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const response = await proxy(request, {} as never);
  const headers = response?.headers;
  return {
    // Pass-through responses forward Clerk's verdict as an overridden request
    // header; redirects built by the proxy keep it as a response header.
    authStatus:
      headers?.get("x-middleware-request-x-clerk-auth-status") ??
      headers?.get("x-clerk-auth-status"),
    location: headers?.get("location") ?? null,
  };
}

describe("proxy against Emulate Clerk", () => {
  it("redirects an anonymous request for a protected route to sign-in", async () => {
    expect(await requestProfile()).toEqual({
      authStatus: "signed-out",
      location: "http://localhost:3000/sign-in?redirect_url=%2Fprofile",
    });
  });

  it("lets a request with a valid Clerk session token through", async () => {
    expect(await requestProfile(await sessionToken())).toEqual({
      authStatus: "signed-in",
      location: null,
    });
  });

  it("treats a token with a tampered payload as signed out", async () => {
    const [header, payload, signature] = (await sessionToken()).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const forged = Buffer.from(
      JSON.stringify({ ...claims, sub: "user_forged" }),
    ).toString("base64url");

    expect(await requestProfile(`${header}.${forged}.${signature}`)).toEqual({
      authStatus: "signed-out",
      location: "http://localhost:3000/sign-in?redirect_url=%2Fprofile",
    });
  });
});
