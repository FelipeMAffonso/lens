// S4-W28 — checkout-readiness summary contract.

import { z } from "zod";

const SaleVerdictEnum = z.enum([
  "genuine-sale",
  "fake-sale",
  "modest-dip",
  "no-sale",
  "insufficient-data",
]);

const BreachBandEnum = z.enum(["none", "low", "moderate", "high", "critical"]);
const CompatOverallEnum = z.enum(["compatible", "partial", "incompatible", "no-rule-matched"]);
const ClaimFoundViaEnum = z.enum(["exact", "normalized", "partial-sentence", "none"]);

const PriceHistorySignal = z
  .object({
    verdict: SaleVerdictEnum,
    discountClaimed: z.number().optional(),
    discountActual: z.number().optional(),
  })
  .strict();

const TotalCostSignal = z
  .object({
    upfront: z.number().positive(),
    year1: z.number().nonnegative(),
    year3: z.number().nonnegative(),
  })
  .strict();

const PassiveScanSignal = z
  .object({
    confirmedCount: z.number().int().nonnegative(),
    topPattern: z.string().optional(),
    ran: z.enum(["opus", "heuristic-only"]).optional(),
  })
  .strict();

const BreachHistorySignal = z
  .object({
    score: z.number().min(0).max(100),
    band: BreachBandEnum,
    hasSsnExposure: z.boolean().optional(),
  })
  .strict();

const CompatSignal = z
  .object({
    overall: CompatOverallEnum,
    blockerCount: z.number().int().nonnegative().optional(),
  })
  .strict();

const ProvenanceSignal = z
  .object({
    affiliateIndicatorCount: z.number().int().nonnegative(),
    worstClaimFoundVia: ClaimFoundViaEnum.optional(),
    minScore: z.number().min(0).max(1).optional(),
  })
  .strict();

export const CheckoutSummaryRequestSchema = z
  .object({
    host: z.string().min(1).max(256),
    productName: z.string().min(1).max(256).optional(),
    sticker: z.number().positive().optional(),
    signals: z
      .object({
        priceHistory: PriceHistorySignal.optional(),
        totalCost: TotalCostSignal.optional(),
        passiveScan: PassiveScanSignal.optional(),
        breachHistory: BreachHistorySignal.optional(),
        compat: CompatSignal.optional(),
        provenance: ProvenanceSignal.optional(),
      })
      .strict(),
  })
  .strict();

export type CheckoutSummaryRequest = z.infer<typeof CheckoutSummaryRequestSchema>;

export type Verdict = "proceed" | "hesitate" | "rethink";
export type RationaleSeverity = "info" | "warn" | "blocker";

export interface RationaleItem {
  signal: string;
  severity: RationaleSeverity;
  message: string;
}

export interface CheckoutSummaryResponse {
  verdict: Verdict;
  score: number;
  rationale: RationaleItem[];
  recommendation: string;
  signalCount: number;
  generatedAt: string;
}
