import { z } from "zod";

export const onboardingAgeSchema = z.number().int().min(1).max(120);
export const onboardingTextSchema = z.string().trim().max(500);

export const onboardingAnswerSchema = z
  .object({
    expectedStep: z.number().int().min(0).max(4),
    text: z.string().max(4000),
    skip: z.boolean().default(false),
    requestId: z.string().uuid(),
  })
  .strict();

export const onboardingFieldSchema = z.enum([
  "name",
  "age",
  "occupation",
  "sportOrSchool",
  "goal",
]);

export const onboardingEditSchema = z
  .object({ field: onboardingFieldSchema })
  .strict();
