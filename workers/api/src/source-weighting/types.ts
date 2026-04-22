// S2-W13 — source-weighting types.

import { z } from "zod";

export const SourceWeightingSchema = z
  .object({
    vendor: z.number().min(0).max(10), // accept 0..10 on input; normalized on write
    independent: z.number().min(0).max(10),
  })
  .strict();
export type SourceWeighting = z.infer<typeof SourceWeightingSchema>;

export const PutRequestSchema = SourceWeightingSchema.extend({
  category: z.string().min(1).max(64).optional(),
}).strict();
export type PutRequest = z.infer<typeof PutRequestSchema>;

export const GLOBAL_CATEGORY = "_global" as const;
export const DEFAULT_WEIGHTING: SourceWeighting = { vendor: 0.5, independent: 0.5 };

export interface PutResponse {
  ok: true;
  category: string;
  weighting: SourceWeighting;
  normalized: boolean;
}

export interface GetResponse {
  category: string | null;
  source: "category" | "global" | "default";
  weighting: SourceWeighting;
}
