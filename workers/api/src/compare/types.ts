// S1-W9 — comparative framing types + Zod boundary schemas.

import { z } from "zod";

export const ComparisonRequestSchema = z
  .object({
    optionA: z.string().min(1).max(128),
    optionB: z.string().min(1).max(128),
    persona: z.string().min(1).max(64).optional(),
    context: z.string().max(512).optional(),
  })
  .strict()
  .refine((data) => data.optionA.trim() !== data.optionB.trim(), {
    message: "optionA and optionB must differ",
  });
export type ComparisonRequest = z.infer<typeof ComparisonRequestSchema>;

export type Lean = "A" | "B" | "tied";

export interface Axis {
  key: string;             // short snake-case id (learning_curve, battery, …)
  label: string;           // human-readable
  aAssessment: string;     // one-sentence claim about option A on this axis
  bAssessment: string;     // one-sentence claim about option B on this axis
  leans: Lean;             // which side the axis favors for the persona
}

export interface Verdict {
  leaning: Lean;
  summary: string;
  caveats: string[];
}

export interface Framing {
  optionA: string;
  optionB: string;
  persona: string;
  axes: Axis[];
  verdict: Verdict;
}

export type FramingSource = "fixture" | "opus" | "none";

export interface FramingResponse {
  ok: true;
  source: FramingSource;
  framing: Framing | null;
  reason?: string;
  generatedAt: string;
}

export interface FixtureEntry {
  optionA: { canonical: string; tokens: Set<string> };
  optionB: { canonical: string; tokens: Set<string> };
  personas: Set<string>;
  perPersonaAxes: Record<string, Axis[]>;
  perPersonaVerdict: Record<string, Verdict>;
}
