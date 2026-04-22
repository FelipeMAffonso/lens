// S4-W23 — compatibility check types + Zod.

import { z } from "zod";

export const CompatItemSchema = z
  .object({
    category: z.string().min(1).max(64),
    name: z.string().min(1).max(256).optional(),
    brand: z.string().min(1).max(64).optional(),
    specs: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  })
  .strict();
export type CompatItem = z.infer<typeof CompatItemSchema>;

export const CompatRequestSchema = z
  .object({
    target: CompatItemSchema,
    equipment: z.array(CompatItemSchema).max(20),
  })
  .strict();
export type CompatRequest = z.infer<typeof CompatRequestSchema>;

export type RuleVerdict = "pass" | "fail" | "warn" | "not-applicable";
export type Severity = "blocker" | "info";

export interface RuleResult {
  id: string;
  verdict: RuleVerdict;
  severity: Severity;
  explanation: string;
  equipmentIndex?: number;
}

export type OverallVerdict = "compatible" | "partial" | "incompatible" | "no-rule-matched";

export interface CompatCheckResponse {
  overall: OverallVerdict;
  rationale: string;
  rules: RuleResult[];
  missingSpecs: string[];
  generatedAt: string;
}
