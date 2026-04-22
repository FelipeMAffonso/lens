// CJ-W48 — gift-buying shared-link types.

import { z } from "zod";

export const CreateGiftRequestSchema = z
  .object({
    recipientLabel: z.string().min(1).max(128).optional(),
    occasion: z.string().min(1).max(64).optional(),
    category: z.string().min(1).max(64).optional(),
    budgetMinUsd: z.number().nonnegative().max(100_000).optional(),
    budgetMaxUsd: z.number().positive().max(100_000),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();
export type CreateGiftRequest = z.infer<typeof CreateGiftRequestSchema>;

export const SubmitResponseSchema = z
  .object({
    criteria: z.record(z.string(), z.number().min(0).max(1)),
    notes: z.string().max(2_000).optional(),
  })
  .strict();
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;

export interface BudgetBand {
  label: "entry" | "thoughtful" | "premium" | "luxury" | "ultra";
  hint: string;
}

export interface GiftAuditCandidate {
  name: string;
  brand: string | null;
  price: number;
  url: string | null;
  utility: number;
  contributions: Record<string, number>;
}

export interface GiftAudit {
  catalog: "fixture" | "none";
  candidates: GiftAuditCandidate[];
  tiers: Record<string, GiftAuditCandidate | null>;
  narrative: string;
}
