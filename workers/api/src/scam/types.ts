// S4-W27 — scam/fraud detection types.

import { z } from "zod";

export const ScamAssessRequestSchema = z
  .object({
    host: z.string().min(1).max(256).regex(/^[a-z0-9.-]+$/i),
    productName: z.string().min(1).max(256).optional(),
    category: z.string().min(1).max(64).optional(),
    price: z.number().positive().optional(),
    receivedViaHttps: z.boolean().optional(),
  })
  .strict();
export type ScamAssessRequest = z.infer<typeof ScamAssessRequestSchema>;

export type SignalVerdict = "ok" | "warn" | "fail";

export interface SignalResult {
  id: string;
  verdict: SignalVerdict;
  detail: string;
}

export type OverallVerdict = "safe" | "caution" | "scam";

export interface Typosquat {
  nearestBrand: string;
  editDistance: number;
}

export interface ScamAssessResponse {
  host: string;
  verdict: OverallVerdict;
  riskScore: number;
  signals: SignalResult[];
  typosquat?: Typosquat;
  source: "fixture" | "hybrid";
  generatedAt: string;
}
