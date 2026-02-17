import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenRouter: vi.fn(),
  provider: vi.fn(),
  wrapLanguageModel: vi.fn(),
  devToolsMiddleware: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));

vi.mock("ai", () => ({
  wrapLanguageModel: mocks.wrapLanguageModel,
}));

vi.mock("@ai-sdk/devtools", () => ({
  devToolsMiddleware: mocks.devToolsMiddleware,
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalApiKey = process.env.OPENROUTER_API_KEY;

describe("ai/providers/openrouter", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createOpenRouter.mockReset();
    mocks.provider.mockReset();
    mocks.wrapLanguageModel.mockReset();
    mocks.devToolsMiddleware.mockReset();

    mocks.createOpenRouter.mockReturnValue(mocks.provider);
    mocks.provider.mockImplementation((modelId: string) => ({ modelId }));
    mocks.devToolsMiddleware.mockReturnValue("devtools-middleware");
    mocks.wrapLanguageModel.mockImplementation(
      (input: Record<string, unknown>) => ({
        wrapped: true,
        ...input,
      }),
    );

    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  it("creates the provider with OPENROUTER_API_KEY", async () => {
    await import("./openrouter");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-key",
    });
  });

  it("resolves model ids from plan, role, and model tier", async () => {
    const { getModelIdForPlan } = await import("./openrouter");

    expect(getModelIdForPlan(null, undefined, "orchestrator")).toBe(
      "google/gemini-2.0-flash-lite-001",
    );
    expect(getModelIdForPlan("my-basic-plan", undefined, "orchestrator")).toBe(
      "google/gemini-2.0-flash-001",
    );
    expect(getModelIdForPlan("my-basic_plus-plan", undefined, "subAgent")).toBe(
      "google/gemini-2.0-flash-001",
    );
    expect(getModelIdForPlan("my-pro-plan", undefined, "orchestrator")).toBe(
      "google/gemini-2.0-flash-lite-001",
    );
    expect(getModelIdForPlan("my-pro-plan", "ADMIN", "orchestrator")).toBe(
      "google/gemini-2.0-flash-lite-001",
    );
    expect(
      getModelIdForPlan("my-pro-plan", "USER", "orchestrator", "BASIC"),
    ).toBe("google/gemini-2.0-flash-001");
    expect(
      getModelIdForPlan("my-basic-plan", "USER", "orchestrator", "PRO"),
    ).toBe("google/gemini-2.0-flash-lite-001");
  });

  it("wraps models with devtools in development", async () => {
    process.env.NODE_ENV = "development";
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();
    mocks.wrapLanguageModel.mockClear();
    mocks.devToolsMiddleware.mockClear();

    const model = getModelForUser("my-basic_plus-plan", undefined, "subAgent");

    expect(mocks.provider).toHaveBeenCalledWith("google/gemini-2.0-flash-001");
    expect(mocks.devToolsMiddleware).toHaveBeenCalledTimes(1);
    expect(mocks.wrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(model).toEqual({
      wrapped: true,
      model: { modelId: "google/gemini-2.0-flash-001" },
      middleware: "devtools-middleware",
    });
  });

  it("returns raw model in non-development environments", async () => {
    process.env.NODE_ENV = "production";
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();
    mocks.wrapLanguageModel.mockClear();

    const model = getModelForUser("my-basic-plan", undefined, "orchestrator");

    expect(mocks.provider).toHaveBeenCalledWith("google/gemini-2.0-flash-001");
    expect(mocks.wrapLanguageModel).not.toHaveBeenCalled();
    expect(model).toEqual({
      modelId: "google/gemini-2.0-flash-001",
    });
  });
});
