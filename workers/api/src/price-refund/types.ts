// S6-W34 — price-drop refund types.

import { z } from "zod";

export const RetailerWindowSchema = z.object({
  retailer: z.string().min(1),
  days: z.number().int().min(0),
  active: z.boolean(),
  note: z.string().optional(),
  portalUrl: z.string().url().optional(),
  email: z.string().email().optional(),
});
export type RetailerWindow = z.infer<typeof RetailerWindowSchema>;

export interface PurchaseLike {
  id: string;
  userId: string;
  retailer: string | null;
  productName: string;
  price: number | null;
  currency?: string | null;
  purchasedAt: string; // ISO date or datetime
  orderId?: string | null;
}

export type ClaimDecision =
  | {
      claim: true;
      delta: number;
      deltaPct: number;
      windowDays: number;
      expiresAt: string; // ISO date
      originalPrice: number;
      currentPrice: number;
    }
  | {
      claim: false;
      reason: string;
      currentPrice?: number;
    };

export interface ClaimDraftPayload {
  businessName: string;
  originalPrice: number;
  currentPrice: number;
  priceDelta: number;
  purchaseDate: string;
  productName: string;
  orderId?: string;
  expiresAt: string;
  claimLetter: string;
  contactUrls: {
    portal?: string;
    email?: string;
  };
}

export const ScanRequestSchema = z
  .object({
    // Optional price overrides per purchase (extension-supplied when it
    // already knows the current price of the owned product in the user's
    // browser, e.g. from the same product page Stage 1 scanned).
    overrides: z
      .array(z.object({ purchaseId: z.string(), currentPrice: z.number().positive() }))
      .max(50)
      .optional(),
  })
  .strict();
export type ScanRequest = z.infer<typeof ScanRequestSchema>;

export interface ScanOutput {
  elapsedMs: number;
  scanned: number;
  eligible: number;
  alreadyFiled: number;
  ineligible: number;
  candidates: Array<{
    purchaseId: string;
    decision: ClaimDecision;
    retailer: string | null;
    productName: string;
  }>;
}
