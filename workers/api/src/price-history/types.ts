// S4-W21 — price-history contract types + Zod boundary schema.

import { z } from "zod";

export const PriceHistoryQuerySchema = z
  .object({
    url: z.string().url("url must be a valid URL"),
    category: z.string().min(1).max(64).optional(),
    claimedDiscountPct: z.coerce.number().min(0).max(100).optional(),
  })
  .strict();

export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;

export interface PricePoint {
  date: string; // ISO YYYY-MM-DD
  price: number;
}

export type SaleVerdict =
  | "genuine-sale"
  | "fake-sale"
  | "modest-dip"
  | "no-sale"
  | "insufficient-data";

export interface PriceHistoryResponse {
  url: string;
  canonicalUrl: string;
  host: string;
  productId?: string;
  currency: "USD";
  series: PricePoint[];
  current: number;
  median90: number;
  min90: number;
  max90: number;
  stddev90: number;
  saleVerdict: SaleVerdict;
  saleExplanation: string;
  discountClaimed?: number;
  discountActual?: number;
  source: "keepa" | "fixture" | "none";
  cacheAgeSec: number;
  generatedAt: string;
}
