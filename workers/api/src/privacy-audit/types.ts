// S4-W25 — privacy-audit types + Zod.

import { z } from "zod";

export const PrivacyAuditRequestSchema = z
  .object({
    privacyPolicyUrl: z.string().url(),
    productName: z.string().min(1).max(256).optional(),
    vendor: z.string().min(1).max(128).optional(),
  })
  .strict();
export type PrivacyAuditRequest = z.infer<typeof PrivacyAuditRequestSchema>;

export interface DataCollectedEntry {
  category: string;
  types: string[];
  purpose: string;
}
export interface SharedWithEntry {
  partyCategory: string;
  purpose: string;
}
export interface DarkPatternEntry {
  pattern: string;
  severity: "warn" | "blocker";
  evidence: string;
}

export interface PrivacyAudit {
  dataCollected: DataCollectedEntry[];
  sharedWithThirdParties: SharedWithEntry[];
  retention: { declared: boolean; period: string | null };
  deletion: { available: boolean; mechanism: string | null };
  consentDarkPatterns: DarkPatternEntry[];
  regulatoryFrameworks: string[];
}

export type Band = "low" | "moderate" | "high";

export interface PrivacyAuditResponse {
  url: string;
  canonicalUrl: string;
  host: string;
  fetched: boolean;
  http?: number;
  audit: PrivacyAudit;
  transparencyScore: number;
  band: Band;
  source: "opus" | "heuristic-only";
  runId: string;
  latencyMs: number;
  generatedAt: string;
}
