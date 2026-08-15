import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/onboarding/persistence", () => ({
  getOnboardingSessionDto: vi.fn(),
}));

import OnboardingPage from "./page";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({ user: null, error: null });
  });

  it("preserves onboarding as the destination while auth is settling", async () => {
    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ next: "/chat/thread_1" }),
      }),
    ).rejects.toThrow("REDIRECT:");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/sign-in?redirect_url=%2Fonboarding%3Fnext%3D%252Fchat%252Fthread_1",
    );
  });
});
