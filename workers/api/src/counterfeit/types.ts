// S3-W18 — counterfeit/grey-market check types.

import { z } from "zod";

export const FeedbackDistSchema = z
  .object({
    star1: z.number().int().nonnegative(),
    star2: z.number().int().nonnegative(),
    star3: z.number().int().nonnegative(),
    star4: z.number().int().nonnegative(),
    star5: z.number().int().nonnegative(),
  })
  .strict();
export type FeedbackDistribution = z.infer<typeof FeedbackDistSchema>;

export const CounterfeitRequestSchema = z
  .object({
    host: z.string().min(1).max(256),
    sellerId: z.string().min(1).max(128).optional(),
    sellerName: z.string().min(1).max(256).optional(),
    sellerAgeDays: z.number().int().nonnegative().optional(),
    feedbackCount: z.number().int().nonnegative().optional(),
    feedbackDistribution: FeedbackDistSchema.optional(),
    productName: z.string().min(1).max(256).optional(),
    category: z.string().min(1).max(64).optional(),
    price: z.number().positive().optional(),
    authorizedRetailerClaim: z.boolean().optional(),
    greyMarketIndicators: z.array(z.string().min(1).max(64)).max(10).optional(),
  })
  .strict();
export type CounterfeitRequest = z.infer<typeof CounterfeitRequestSchema>;

export type SignalVerdict = "ok" | "warn" | "fail";
export type OverallVerdict = "authentic" | "caution" | "likely-counterfeit";

export interface SignalResult {
  id: string;
  verdict: SignalVerdict;
  detail: string;
}

export interface FeedbackProfile {
  p1: number;
  p5: number;
  total: number;
  bimodal: boolean;
}

export interface CounterfeitResponse {
  host: string;
  verdict: OverallVerdict;
  riskScore: number;
  signals: SignalResult[];
  feedbackProfile?: FeedbackProfile;
  generatedAt: string;
}
