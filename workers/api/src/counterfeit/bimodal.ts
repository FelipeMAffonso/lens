// S3-W18 — feedback-distribution bimodal analyzer.
// Detects the signature "many 1-star + many 5-star, sparse 2-4" pattern that
// characterizes review-manipulated counterfeit listings.

import type { FeedbackDistribution, FeedbackProfile } from "./types.js";

const BIMODAL_P1_THRESHOLD = 0.2;
const BIMODAL_P5_THRESHOLD = 0.6;

export function analyzeBimodal(dist: FeedbackDistribution): FeedbackProfile {
  const total = dist.star1 + dist.star2 + dist.star3 + dist.star4 + dist.star5;
  if (total === 0) {
    return { p1: 0, p5: 0, total: 0, bimodal: false };
  }
  const p1 = dist.star1 / total;
  const p5 = dist.star5 / total;
  const bimodal = p1 >= BIMODAL_P1_THRESHOLD && p5 >= BIMODAL_P5_THRESHOLD;
  return {
    p1: round4(p1),
    p5: round4(p5),
    total,
    bimodal,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
