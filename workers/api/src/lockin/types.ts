// S7-W40 — lock-in cost tracking types.

import { z } from "zod";

export const LockinPurchaseSchema = z
  .object({
    productName: z.string().min(1).max(256),
    brand: z.string().min(1).max(120).optional(),
    category: z.string().min(1).max(80).optional(),
    amountUsd: z.number().finite().nonnegative(),
    purchasedAt: z.string().max(32).optional(), // ISO date, not strictly validated here
  })
  .strict();
export type LockinPurchase = z.infer<typeof LockinPurchaseSchema>;

export const LockinRequestSchema = z
  .object({
    purchases: z.array(LockinPurchaseSchema).max(500),
  })
  .strict();
export type LockinRequest = z.infer<typeof LockinRequestSchema>;

export type ExitFrictionBand = "low" | "medium" | "high" | "critical";

export interface LockinCitation {
  label: string;
  url: string;
}

export interface EcosystemResult {
  slug: string;
  label: string;
  matchedPurchases: number;
  gross: number;
  estimatedSwitchingCost: number;
  nonDollarLockIn: string[];
  exitFriction: ExitFrictionBand;
  citations: LockinCitation[];
}

export interface LockinResponse {
  source: "fixture";
  ecosystems: EcosystemResult[];
  totalGross: number;
  totalSwitchingCost: number;
  reason?: string;
  generatedAt: string;
}

export interface EcosystemFixture {
  slug: string;
  label: string;
  matchers: {
    brands?: string[];
    productTokens?: string[];
    categoryTokens?: string[];
  };
  lockInMultiplier: number;
  nonDollarLockIn: string[];
  citations: LockinCitation[];
}
