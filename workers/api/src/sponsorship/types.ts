// S3-W19 — sponsorship scanner types.

import { z } from "zod";
import type { AffiliateIndicator } from "../provenance/types.js";

export const SponsorshipRequestSchema = z
  .object({
    url: z.string().url(),
    articleContext: z.string().max(32_000).optional(),
  })
  .strict();
export type SponsorshipRequest = z.infer<typeof SponsorshipRequestSchema>;

export type DisclosureKind =
  | "ftc-affiliate"
  | "sponsored-post"
  | "paid-partnership"
  | "in-partnership-with";

export interface DisclosureMatch {
  kind: DisclosureKind;
  detail: string;
  snippet: string;
}

export type SponsorshipVerdict = "clear" | "disclosed-partnership" | "undisclosed-partnership";

export interface SponsorshipResponse {
  url: string;
  canonicalUrl: string;
  host: string;
  fetched: boolean;
  http?: number;
  affiliateIndicators: AffiliateIndicator[];
  disclosures: DisclosureMatch[];
  verdict: SponsorshipVerdict;
  rationale: string;
  source: "fetched" | "context-only";
  generatedAt: string;
}
