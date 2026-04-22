// S6-W37 — performance rating types + Zod boundary schemas.

import { z } from "zod";

export const CriterionSignalEnum = z.enum(["more-important", "about-right", "less-important"]);
export type CriterionSignal = z.infer<typeof CriterionSignalEnum>;

export const CriterionFeedbackSchema = z
  .object({
    criterion: z.string().min(1).max(64),
    signal: CriterionSignalEnum,
  })
  .strict();
export type CriterionFeedback = z.infer<typeof CriterionFeedbackSchema>;

export const PerformanceRequestSchema = z
  .object({
    overallRating: z.number().int().min(1).max(5),
    wouldBuyAgain: z.boolean(),
    criterionFeedback: z.array(CriterionFeedbackSchema).max(30).optional(),
    notes: z.string().max(4_000).optional(),
  })
  .strict();
export type PerformanceRequest = z.infer<typeof PerformanceRequestSchema>;

export interface PreferenceUpdate {
  applied: boolean;
  category?: string;
  before?: Record<string, number>;
  after?: Record<string, number>;
  deltas?: Record<string, number>;
  reason: string;
}

export interface PerformanceResponse {
  ok: true;
  ratingId: string;
  preferenceUpdate: PreferenceUpdate;
  createdAt: string;
}
