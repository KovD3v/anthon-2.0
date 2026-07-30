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

const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalBaseUrl = process.env.OPENROUTER_BASE_URL;

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
    delete process.env.OPENROUTER_BASE_URL;
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.OPENROUTER_API_KEY = originalApiKey;
    process.env.OPENROUTER_BASE_URL = originalBaseUrl;
  });

  it("creates the provider with OPENROUTER_API_KEY", async () => {
    await import("./openrouter");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-key",
    });
  });

  it("uses an explicit OpenRouter base URL for isolated test environments", async () => {
    process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:4317/api/v1";

    await import("./openrouter");

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-key",
      baseURL: "http://127.0.0.1:4317/api/v1",
    });
  });

  it("resolves model ids from plan, role, and model tier", async () => {
    const { getModelIdForPlan } = await import("./openrouter");

    expect(getModelIdForPlan(null, undefined, "orchestrator")).toBe(
      "openai/gpt-5.6-luna",
    );
    expect(
      getModelIdForPlan(
        "my-basic-plan",
        undefined,
        "orchestrator",
        undefined,
        "ACTIVE",
      ),
    ).toBe("openai/gpt-5.6-luna");
    expect(
      getModelIdForPlan(
        "my-basic_plus-plan",
        undefined,
        "subAgent",
        undefined,
        "ACTIVE",
      ),
    ).toBe("google/gemini-2.5-flash");
    expect(
      getModelIdForPlan(
        "my-pro-plan",
        undefined,
        "orchestrator",
        undefined,
        "ACTIVE",
      ),
    ).toBe("openai/gpt-5.6-luna");
    expect(
      getModelIdForPlan(
        "my-pro-plan",
        "ADMIN",
        "orchestrator",
        undefined,
        "ACTIVE",
      ),
    ).toBe("openai/gpt-5.6-luna");
    expect(
      getModelIdForPlan(
        "my-pro-plan",
        "USER",
        "orchestrator",
        "BASIC",
        "ACTIVE",
      ),
    ).toBe("openai/gpt-5.6-luna");
    expect(
      getModelIdForPlan(
        "my-basic-plan",
        "USER",
        "orchestrator",
        "PRO",
        "ACTIVE",
      ),
    ).toBe("openai/gpt-5.6-luna");
  });

  it("passes orchestrator fallback models to OpenRouter", async () => {
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();

    const model = getModelForUser(
      "my-pro-plan",
      undefined,
      "orchestrator",
      undefined,
      "ACTIVE",
    );

    expect(mocks.provider).toHaveBeenCalledWith("openai/gpt-5.6-luna", {
      models: ["deepseek/deepseek-v4-flash"],
    });
    expect(model).toEqual({ modelId: "openai/gpt-5.6-luna" });
  });

  it("merges OpenRouter model settings with orchestrator fallbacks", async () => {
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();

    getModelForUser(
      "my-pro-plan",
      undefined,
      "orchestrator",
      undefined,
      "ACTIVE",
      { parallelToolCalls: false },
    );

    expect(mocks.provider).toHaveBeenCalledWith("openai/gpt-5.6-luna", {
      models: ["deepseek/deepseek-v4-flash"],
      parallelToolCalls: false,
    });
  });

  it("does not attach orchestrator fallback models to sub-agent routing", async () => {
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();

    getModelForUser(
      "my-basic_plus-plan",
      undefined,
      "subAgent",
      undefined,
      "ACTIVE",
    );

    expect(mocks.provider).toHaveBeenCalledWith("google/gemini-2.5-flash");
  });

  it("throws when active subscription has invalid planId", async () => {
    const { getModelIdForPlan } = await import("./openrouter");

    expect(() =>
      getModelIdForPlan(
        "invalid-plan",
        "USER",
        "orchestrator",
        undefined,
        "ACTIVE",
      ),
    ).toThrow("Active subscription requires a recognized planId");
  });

  it("wraps models with devtools in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();
    mocks.wrapLanguageModel.mockClear();
    mocks.devToolsMiddleware.mockClear();

    const model = getModelForUser(
      "my-basic_plus-plan",
      undefined,
      "subAgent",
      undefined,
      "ACTIVE",
    );

    expect(mocks.provider).toHaveBeenCalledWith("google/gemini-2.5-flash");
    expect(mocks.devToolsMiddleware).toHaveBeenCalledTimes(1);
    expect(mocks.wrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(model).toEqual({
      wrapped: true,
      model: { modelId: "google/gemini-2.5-flash" },
      middleware: "devtools-middleware",
    });
  });

  it("returns raw model in non-development environments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getModelForUser } = await import("./openrouter");

    mocks.provider.mockClear();
    mocks.wrapLanguageModel.mockClear();

    const model = getModelForUser(
      "my-basic-plan",
      undefined,
      "orchestrator",
      undefined,
      "ACTIVE",
    );

    expect(mocks.provider).toHaveBeenCalledWith("openai/gpt-5.6-luna", {
      models: ["deepseek/deepseek-v4-flash"],
    });
    expect(mocks.wrapLanguageModel).not.toHaveBeenCalled();
    expect(model).toEqual({
      modelId: "openai/gpt-5.6-luna",
    });
  });

  it("builds a raw provider model for an explicit benchmark model id", async () => {
    const { getModelById } = await import("./openrouter");

    mocks.provider.mockClear();

    const model = getModelById("candidate/model");

    expect(mocks.provider).toHaveBeenCalledWith("candidate/model");
    expect(model).toEqual({ modelId: "candidate/model" });
  });
});
