import { z } from "zod";

export const HostAISchema = z.enum(["chatgpt", "claude", "gemini", "rufus", "unknown"]);

export const AuditInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    source: HostAISchema,
    raw: z.string().min(1).max(50_000),
    userPrompt: z.string().max(10_000).optional(),
  }),
  z.object({
    kind: z.literal("image"),
    source: HostAISchema,
    imageBase64: z.string().min(1),
    imageMime: z
      .enum(["image/png", "image/jpeg", "image/webp", "image/gif"])
      .optional(),
    userPrompt: z.string().max(10_000).optional(),
  }),
  z.object({
    kind: z.literal("query"),
    source: HostAISchema.optional(),
    userPrompt: z.string().min(1).max(10_000),
    category: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("url"),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((v) => /^https?:\/\//i.test(v), { message: "URL must start with http:// or https://" }),
    userPrompt: z.string().max(10_000).optional(),
    category: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("photo"),
    imageBase64: z.string().min(1),
    imageMime: z
      .enum(["image/png", "image/jpeg", "image/webp", "image/gif"])
      .optional(),
    userPrompt: z.string().max(10_000).optional(),
    category: z.string().max(200).optional(),
  }),
]);

export const CriterionSchema = z.object({
  name: z.string(),
  weight: z.number().min(0).max(1),
  direction: z.enum(["higher_is_better", "lower_is_better", "target", "binary"]),
  target: z.union([z.string(), z.number()]).optional(),
});

export const UserIntentSchema = z.object({
  category: z.string(),
  criteria: z.array(CriterionSchema).min(1),
  budget: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().default("USD"),
    })
    .optional(),
  rawCriteriaText: z.string(),
});

export const ClaimInputSchema = z.object({
  attribute: z.string(),
  statedValue: z.string(),
});

export const AIRecommendationSchema = z.object({
  host: HostAISchema,
  pickedProduct: z.object({
    name: z.string(),
    brand: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().optional(),
  }),
  claims: z.array(ClaimInputSchema),
  reasoningTrace: z.string(),
  citedUrls: z.array(z.string()).optional(),
});
