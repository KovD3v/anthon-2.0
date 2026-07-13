import { z } from "zod";

export const generationConfigSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().int().min(1).max(32_768).optional(),
    reasoning: z.enum(["disabled", "low", "medium", "high"]).optional(),
    fallbacks: z.literal(false).default(false),
  })
  .strict();

const variantSchema = z.object({
  modelId: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[^\s/]+\/.+$/),
  generationConfig: generationConfigSchema,
});

export const createModelExperimentSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]+$/),
  name: z.string().trim().min(3).max(160),
  posthogFlagKey: z.string().trim().min(3).max(160),
  targetCountry: z.string().trim().toUpperCase().length(2).default("IT"),
  cooldownHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
  perUserCap: z.number().int().min(1).max(100).default(5),
  control: variantSchema,
  candidate: variantSchema,
});

export const updateModelExperimentSchema = createModelExperimentSchema
  .omit({ key: true })
  .partial();

export const voteSchema = z.object({
  choice: z.enum(["A", "B", "TIE"]),
});

export type CreateModelExperimentInput = z.infer<
  typeof createModelExperimentSchema
>;
