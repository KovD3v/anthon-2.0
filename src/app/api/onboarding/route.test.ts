import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getSession: vi.fn(),
  answer: vi.fn(),
  edit: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/onboarding/persistence", () => ({
  getOnboardingSessionDto: mocks.getSession,
  applyOnboardingAnswer: mocks.answer,
  editOnboardingField: mocks.edit,
  confirmOnboarding: mocks.confirm,
}));

import { POST as ANSWER } from "./answer/route";
import { POST as CONFIRM } from "./confirm/route";
import { GET } from "./route";

const dto = {
  status: "IN_PROGRESS" as const,
  currentStep: 0,
  totalSteps: 5 as const,
  currentField: "name" as const,
  question: "Come vuoi che ti chiami?",
  skipLabel: "Preferisco non dirlo",
  draft: {
    name: null,
    age: null,
    occupation: null,
    sport: null,
    experience: null,
    goal: null,
  },
  skippedFields: [],
  messages: [],
};

describe("onboarding API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.getSession.mockResolvedValue(dto);
    mocks.answer.mockResolvedValue(dto);
    mocks.confirm.mockResolvedValue({ ...dto, status: "REVIEW" });
  });

  it("rejects signed-out and guest reads", async () => {
    mocks.getAuthUser.mockResolvedValueOnce({
      user: null,
      error: "Not authenticated",
    });
    expect((await GET()).status).toBe(401);

    mocks.getAuthUser.mockResolvedValueOnce({
      user: { id: "guest-1", isGuest: true },
      error: null,
    });
    expect((await GET()).status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("resumes the authenticated account session", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(dto);
    expect(mocks.getSession).toHaveBeenCalledWith("user-1");
  });

  it("rejects malformed answers before state changes", async () => {
    const response = await ANSWER(
      new Request("http://localhost/api/onboarding/answer", {
        method: "POST",
        body: JSON.stringify({ expectedStep: 8, text: "Giulia" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("forwards a valid answer and confirms only through the final route", async () => {
    const requestId = crypto.randomUUID();
    const answer = await ANSWER(
      new Request("http://localhost/api/onboarding/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedStep: 0,
          text: "Giulia",
          skip: false,
          requestId,
        }),
      }),
    );
    expect(answer.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith({
      userId: "user-1",
      expectedStep: 0,
      userText: "Giulia",
      skip: false,
      requestId,
    });

    expect((await CONFIRM()).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith("user-1");
  });
});
