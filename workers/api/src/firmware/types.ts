// S7-W38 — firmware / CVE monitoring types.

import { z } from "zod";

export const SeverityEnum = z.enum(["critical", "high", "medium", "low", "informational"]);
export type Severity = z.infer<typeof SeverityEnum>;

export interface FirmwareAdvisory {
  source: "manufacturer" | "nvd";
  advisoryId: string;
  vendor: string;
  affectedModels: string[];
  title: string;
  description: string;
  severity: Severity;
  cvssScore: number | null;
  cveIds: string[];
  fixedFirmwareVersion: string | null;
  remediationSteps: string;
  publishedAt: string;
  sourceUrl: string;
}

export interface PurchaseLike {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  purchased_at: string;
}

export interface FirmwareMatch {
  advisory: FirmwareAdvisory;
  purchase: PurchaseLike;
  score: number;
  reasons: string[];
}

export interface AssessedMatch extends FirmwareMatch {
  band: "critical" | "high" | "medium" | "low" | "informational";
  shouldNotify: boolean;       // email + dashboard + intervention
  shouldDashboardOnly: boolean; // dashboard card only
}

export const FirmwareScanRequestSchema = z
  .object({
    purchaseIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  })
  .strict();
export type FirmwareScanRequest = z.infer<typeof FirmwareScanRequestSchema>;

export interface FirmwareScanResponse {
  ok: true;
  scanned: number;
  matched: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  interventions: Array<{
    interventionId: string;
    purchaseId: string;
    advisoryId: string;
    vendor: string;
    severity: Severity;
    cvssScore: number | null;
    fixedFirmwareVersion: string | null;
    title: string;
    remediationSteps: string;
    publishedAt: string;
    sourceUrl: string;
  }>;
  generatedAt: string;
  elapsedMs: number;
}
