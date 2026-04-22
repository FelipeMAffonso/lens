// S7-W39 — accessory discovery types + Zod boundary schemas.

import { z } from "zod";

export const ProductContextSchema = z
  .object({
    category: z.string().min(1).max(64),
    brand: z.string().min(1).max(64).optional(),
    productName: z.string().min(1).max(256).optional(),
  })
  .strict();
export type ProductContext = z.infer<typeof ProductContextSchema>;

export const CriteriaSchema = z.record(z.string(), z.number().min(0).max(1));

export const DiscoverRequestSchema = z
  .object({
    purchaseId: z.string().min(1).max(64).optional(),
    productContext: ProductContextSchema.optional(),
    criteria: CriteriaSchema.optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.purchaseId) || Boolean(data.productContext), {
    message: "either purchaseId or productContext is required",
  });
export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

export interface CompatibleWith {
  brands?: string[];
  productTokens?: string[];
  portafilterSize?: "54mm" | "58mm";
}

export interface AccessoryFixture {
  name: string;
  brand: string;
  price: number;
  category: string;                 // e.g. "espresso-machines" — matches purchase.category
  accessoryKind: string;            // "accessory/tamper", "accessory/hub", ...
  url: string | null;               // canonical, never affiliate-tagged
  specs: {
    quality: number;                // 0..1
    price_score?: number;           // 0..1 (higher = better value)
    longevity: number;              // 0..1
    [k: string]: number | undefined;
  };
  compatibleWith: CompatibleWith;
  why: string;                      // one-sentence UI explainer
}

export interface CompatResult {
  compatible: boolean;
  rule: string;                     // "brand-match", "portafilter-54mm", "fallback-unknown-brand", …
  detail?: string;
}

export interface AccessoryCandidate {
  name: string;
  category: string;
  accessoryKind: string;
  brand: string;
  price: number;
  url: string | null;
  compat: CompatResult;
  utility: number;
  contributions: Record<string, number>;
  why: string;
}

export interface DiscoverResponse {
  ok: true;
  source: "fixture";
  productContext: ProductContext;
  candidates: AccessoryCandidate[];
  incompatible: AccessoryCandidate[];
  reason?: string;
  generatedAt: string;
}
