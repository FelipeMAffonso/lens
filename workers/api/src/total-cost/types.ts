// S4-W24 — true-total-cost contract.

import { z } from "zod";

export const TotalCostQuerySchema = z
  .object({
    url: z.string().url(),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
    country: z.string().length(2).toUpperCase().optional().default("US"),
    overrideSticker: z.coerce.number().positive().optional(),
    // Extension hints — the extension already has the product context from
    // the page DOM and wants to skip the worker's fetch. Also unblocks smoke
    // tests when Cloudflare-to-retailer fetches get bot-screened.
    productName: z.string().min(1).max(256).optional(),
    category: z.string().min(1).max(64).optional(),
  })
  .strict();
export type TotalCostQuery = z.infer<typeof TotalCostQuerySchema>;

export interface HiddenCostOut {
  name: string;
  annualMin: number;
  annualMax: number;
  annualMid: number;
  frequency: string;
}

export interface TaxOut {
  rate: number;
  amount: number;
  jurisdiction: string;
  source: "zip" | "state" | "country" | "fallback";
  note?: string;
}

export interface ShippingOut {
  amount: number;
  reasoning: string;
  source: "host-policy" | "estimated";
}

export interface TotalsOut {
  upfront: number;
  year1: number;
  year3: number;
}

export interface TotalCostResponse {
  url: string;
  canonicalUrl: string;
  host: string;
  product: {
    name: string;
    brand?: string;
    category?: string;
  };
  sticker: number;
  currency: "USD";
  tax: TaxOut;
  shipping: ShippingOut;
  hiddenCosts: HiddenCostOut[];
  totals: TotalsOut;
  notes: string[];
}
