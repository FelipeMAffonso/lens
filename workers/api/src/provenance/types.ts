// S3-W16 — provenance verify types.

import { z } from "zod";

export const VerifyRequestSchema = z
  .object({
    citedUrls: z
      .array(
        z
          .object({
            url: z.string().url(),
            claim: z.string().min(1).max(800),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export type AffiliateKind =
  | "amazon-tag"
  | "share-a-sale"
  | "awin"
  | "rakuten"
  | "skimlinks"
  | "impact-radius"
  | "rel-sponsored"
  | "utm-tracking"
  | "sponsored-disclosure";

export interface AffiliateIndicator {
  kind: AffiliateKind;
  detail: string;
}

export type ClaimFoundVia = "exact" | "normalized" | "partial-sentence" | "none";

export interface VerifyResult {
  url: string;
  canonicalUrl: string;
  host: string;
  fetched: boolean;
  http?: number;
  claim: string;
  claimFound: boolean;
  claimFoundVia: ClaimFoundVia;
  claimSnippet?: string;
  affiliateIndicators: AffiliateIndicator[];
  provenanceScore: number;
}

export interface VerifyResponse {
  results: VerifyResult[];
  elapsedMs: number;
}
