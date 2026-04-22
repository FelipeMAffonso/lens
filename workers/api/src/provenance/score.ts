// S3-W16 — composite provenance score.

import type { AffiliateIndicator, ClaimFoundVia } from "./types.js";

export interface ScoreInput {
  fetched: boolean;
  claimFoundVia: ClaimFoundVia;
  affiliateIndicators: AffiliateIndicator[];
}

const MAX_AFFILIATE_PENALTY = 0.4;
const PER_INDICATOR_PENALTY = 0.2;
const UNFETCHED_PENALTY = 0.3;

export function computeProvenanceScore(input: ScoreInput): number {
  let score = 0;
  if (input.claimFoundVia === "exact" || input.claimFoundVia === "normalized") {
    score += 0.6;
  } else if (input.claimFoundVia === "partial-sentence") {
    score += 0.3;
  }
  const affiliatePenalty = Math.min(
    MAX_AFFILIATE_PENALTY,
    input.affiliateIndicators.length * PER_INDICATOR_PENALTY,
  );
  score -= affiliatePenalty;
  if (!input.fetched) score -= UNFETCHED_PENALTY;
  return clamp01(round4(score));
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
