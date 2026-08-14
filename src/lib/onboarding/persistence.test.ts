import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";

function modelFields(modelName: string) {
  const model = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === modelName,
  );
  return new Set(model?.fields.map((field) => field.name) ?? []);
}

describe("onboarding persistence contract", () => {
  it("exposes the account gate, profile fields, and versioned session", () => {
    expect(modelFields("User")).toContain("onboardingCompletedAt");
    expect(modelFields("Profile")).toEqual(
      expect.objectContaining(new Set(["age", "occupation"])),
    );

    const sessionFields = modelFields("OnboardingSession");
    expect(sessionFields).toEqual(
      expect.objectContaining(
        new Set([
          "userId",
          "version",
          "status",
          "currentStep",
          "draft",
          "skippedFields",
          "transcript",
        ]),
      ),
    );
  });
});
