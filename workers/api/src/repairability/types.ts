// S7-W41 — repairability lookup types.

import { z } from "zod";

export const RepairabilityRequestSchema = z
  .object({
    productName: z.string().min(1).max(256),
    brand: z.string().min(1).max(120).optional(),
    category: z.string().min(1).max(80).optional(),
    productId: z.string().min(1).max(120).optional(),
  })
  .strict();
export type RepairabilityRequest = z.infer<typeof RepairabilityRequestSchema>;

export type RepairabilityBand =
  | "easy"
  | "medium"
  | "hard"
  | "unrepairable"
  | "no-info";

export type PartsAvailabilityTier =
  | "available"
  | "discontinued"
  | "limited"
  | "unavailable"
  | "unknown";

export interface RepairabilityCitation {
  label: string;
  url: string;
  source: "ifixit" | "reddit" | "manufacturer" | "press";
}

export interface RepairabilityResponse {
  source: "fixture" | "ifixit" | "hybrid" | "none";
  productName: string;
  brand?: string;
  category?: string;
  score?: number;                       // 1..10, absent when source==="none"
  band: RepairabilityBand;
  commonFailures: string[];
  partsAvailability: {
    manufacturer: PartsAvailabilityTier;
    thirdParty: PartsAvailabilityTier;
  };
  citations: RepairabilityCitation[];
  reason?: string;                      // populated when source==="none"
  generatedAt: string;
}

export interface RepairabilityFixture {
  matchers: {
    brands?: string[];
    productTokens?: string[];
    productId?: string;
  };
  score: number;
  band: Exclude<RepairabilityBand, "no-info">;
  commonFailures: string[];
  partsAvailability: {
    manufacturer: PartsAvailabilityTier;
    thirdParty: PartsAvailabilityTier;
  };
  citations: RepairabilityCitation[];
}
