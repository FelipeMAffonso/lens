import { z } from "zod";

export const HostAISchema = z.enum(["chatgpt", "claude", "gemini", "rufus", "perplexity", "unknown"]);

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
  confidence: z.number().min(0).max(1).optional(),
  source: z
    .enum([
      "stated",
      "budget",
      "category_prior",
      "profile",
      "revealed",
      "clarification",
      "explicit_edit",
      "safety_guardrail",
      "default",
    ])
    .optional(),
  rationale: z.string().optional(),
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
  preferenceModel: z
    .object({
      version: z.literal("layered-utility-v1"),
      confidence: z.number().min(0).max(1),
      needsClarification: z.boolean(),
      layers: z.array(
        z.object({
          layer: z.enum([
            "stated",
            "budget",
            "category_prior",
            "profile",
            "revealed",
            "cross_category",
            "guardrail",
          ]),
          status: z.enum(["used", "missing", "requires_consent", "user_controlled"]),
          signals: z.number().int().nonnegative(),
          rationale: z.string(),
        }),
      ),
      userControls: z.array(z.string()),
      privacy: z.object({
        dataTier: z.enum(["in_flight", "local_only", "server_profile", "oauth_sensitive"]),
        usesExternalBehavior: z.boolean(),
        consentRequiredFor: z.array(z.string()),
        retention: z.enum(["per_request", "device_local", "account_scoped"]),
      }),
    })
    .optional(),
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
    url: z.string().url().optional(),
  }),
  claims: z.array(ClaimInputSchema),
  reasoningTrace: z.string(),
  citedUrls: z.array(z.string()).optional(),
  sourceUrl: z.string().url().optional(),
});

export const CustomerJourneyStageIdSchema = z.enum([
  "pre_search",
  "ai_research",
  "product_page",
  "cart_checkout",
  "post_purchase",
  "ownership",
  "end_of_life",
]);

export const CustomerJourneyStatusSchema = z.enum(["live", "partial", "planned"]);

export const CustomerJourneyConsentTierSchema = z.enum([
  "none",
  "local_only",
  "account",
  "oauth_sensitive",
  "financial_sensitive",
]);

export const CustomerJourneyStageSchema = z.object({
  id: CustomerJourneyStageIdSchema,
  label: z.string(),
  status: CustomerJourneyStatusSchema,
  promise: z.string(),
  surfaces: z.array(z.string()),
  endpoints: z.array(z.string()),
  workflows: z.array(z.string()),
  dataSources: z.array(z.string()),
  implementedSignals: z.array(z.string()),
  edgeCasesCovered: z.array(z.string()),
  failureRecovery: z.array(z.string()),
  consentTier: CustomerJourneyConsentTierSchema,
  userControls: z.array(z.string()),
  nextHardening: z.array(z.string()),
});

export const CustomerJourneyMapSchema = z.object({
  version: z.literal("customer-journey-map-v1"),
  generatedAt: z.string(),
  readiness: z.object({
    live: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    planned: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    score: z.number().min(0).max(1),
  }),
  guarantees: z.array(z.string()),
  privacyControls: z.array(z.string()),
  stages: z.array(CustomerJourneyStageSchema),
});
