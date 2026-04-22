// S4-W22 — Zod schemas + TypeScript types for the /passive-scan contract.
// Boundary validation for data flowing from the extension content script
// into the Stage-2 LLM verification pipeline.

import { z } from "zod";

export const SeverityEnum = z.enum([
  "nuisance",
  "manipulative",
  "deceptive",
  "illegal-in-jurisdiction",
]);

export const PageTypeEnum = z.enum([
  "checkout",
  "cart",
  "product",
  "article",
  "landing",
  "review",
  "marketplace",
  "other",
]);

export const HitSchema = z
  .object({
    packSlug: z
      .string()
      .min(1)
      .max(128)
      .regex(/^dark-pattern\/[a-z0-9-]+$/, "packSlug must be dark-pattern/<slug>"),
    brignullId: z.string().min(1).max(64),
    severity: SeverityEnum,
    excerpt: z.string().min(1).max(400), // extension trims to ≤200, allow 2x cushion
  })
  .strict();

export const PassiveScanRequestSchema = z
  .object({
    host: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[a-z0-9.-]+$/i, "host must be a DNS-style string"),
    pageType: PageTypeEnum,
    url: z.string().url().optional(),
    jurisdiction: z.string().min(2).max(32).optional().default("us-federal"),
    hits: z.array(HitSchema).min(1).max(20),
  })
  .strict();

export type PassiveScanRequest = z.infer<typeof PassiveScanRequestSchema>;
export type Hit = z.infer<typeof HitSchema>;

export interface RegulatoryCitation {
  packSlug: string;
  officialName: string;
  citation: string;
  status: "in-force" | "delayed" | "vacated" | "superseded" | "preempted";
  effectiveDate: string;
  userRightsPlainLanguage?: string;
}

export interface InterventionSuggestion {
  packSlug: string;
  canonicalName: string;
  consentTier: string;
  actionUrl?: string;
}

export interface FeeBreakdown {
  label: string;
  amountUsd?: number;
  frequency?: "one-time" | "per-night" | "per-month" | "per-year" | "per-transaction";
}

export interface ConfirmedHit {
  packSlug: string;
  brignullId: string;
  verdict: "confirmed" | "uncertain";
  llmExplanation: string;
  regulatoryCitation?: RegulatoryCitation;
  suggestedInterventions: InterventionSuggestion[];
  feeBreakdown?: FeeBreakdown;
}

export interface DismissedHit {
  packSlug: string;
  reason: string;
}

export interface PassiveScanResponse {
  confirmed: ConfirmedHit[];
  dismissed: DismissedHit[];
  latencyMs: number;
  ran: "opus" | "heuristic-only";
  runId: string;
}
