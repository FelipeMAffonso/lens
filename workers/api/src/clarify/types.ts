// S1-W8 — clarify API request/response shapes.

import { z } from "zod";

const criterionSchema = z.object({
  name: z.string().min(1).max(120),
  weight: z.number().finite().nonnegative(),
  direction: z.enum(["higher_is_better", "lower_is_better", "target", "binary"]),
  target: z.union([z.string(), z.number()]).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
});

const intentSchema = z.object({
  category: z.string().min(1).max(256),
  criteria: z.array(criterionSchema).max(20),
  budget: z
    .object({ min: z.number().optional(), max: z.number().optional(), currency: z.string() })
    .optional(),
  rawCriteriaText: z.string().max(10_000),
});

export const ClarifyRequestSchema = z.object({
  intent: intentSchema,
  userPrompt: z.string().max(10_000).optional(),
});
export type ClarifyRequest = z.infer<typeof ClarifyRequestSchema>;

export const ClarifyQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  targetCriterion: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
  optionA: z.object({
    label: z.string().min(1).max(300),
    impliedWeightShift: z.record(z.string(), z.number()),
  }),
  optionB: z.object({
    label: z.string().min(1).max(300),
    impliedWeightShift: z.record(z.string(), z.number()),
  }),
});
export type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>;

export const ClarifyAnswerSchema = z.object({
  questionId: z.string().min(1).max(64),
  chose: z.enum(["A", "B"]),
});
export type ClarifyAnswer = z.infer<typeof ClarifyAnswerSchema>;

export const ClarifyApplyRequestSchema = z.object({
  intent: intentSchema,
  answers: z.array(
    z.object({
      question: ClarifyQuestionSchema,
      answer: ClarifyAnswerSchema,
    }),
  ),
});
export type ClarifyApplyRequest = z.infer<typeof ClarifyApplyRequestSchema>;

export interface ClarifyResponse {
  needsClarification: boolean;
  questions: ClarifyQuestion[];
  intent: ClarifyRequest["intent"]; // echoed back when no clarification needed
  source: "opus" | "fallback" | "skipped";
  generatedAt: string;
}

export const CONFIDENCE_THRESHOLD = 0.6;
export const MAX_QUESTIONS = 4;
export const MIN_QUESTIONS = 2;
