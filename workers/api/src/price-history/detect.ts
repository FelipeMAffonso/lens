// S4-W21 — sale-legitimacy verdict.
//
// Inputs: computed stats + optional claimedDiscountPct banner value.
// Output: a single SaleVerdict + human-readable explanation + the actual
// discount delta vs the rolling 90-day median.

import type { SaleVerdict } from "./types.js";
import type { SeriesStats } from "./stats.js";

const MIN_SERIES_POINTS = 14;
const FAKE_SALE_CLAIMED_THRESHOLD = 15;    // a loud "X% off" banner is ≥ 15%.
const FAKE_SALE_ACTUAL_UPPER = 5;          // but actual discount vs median < 5%.
const GENUINE_STDDEV_MULTIPLIER = 1;       // below median by > 1 stddev.
const MODEST_DIP_UPPER_PCT = 5;            // 1-5% below median.

export interface SaleDetectionInput {
  stats: SeriesStats;
  claimedDiscountPct?: number; // 0..100
}

export interface SaleDetectionResult {
  verdict: SaleVerdict;
  explanation: string;
  discountClaimed?: number;
  discountActual?: number; // percent under 90-day median; negative = more expensive
}

export function detectSale(input: SaleDetectionInput): SaleDetectionResult {
  const { stats, claimedDiscountPct } = input;

  if (stats.count < MIN_SERIES_POINTS) {
    return {
      verdict: "insufficient-data",
      explanation: `Only ${stats.count} data points available; need ≥ ${MIN_SERIES_POINTS} for a reliable verdict.`,
    };
  }

  if (stats.median === 0) {
    return {
      verdict: "insufficient-data",
      explanation: "Rolling median is zero; refusing to divide.",
    };
  }

  const actualDiscountPct = ((stats.median - stats.current) / stats.median) * 100;
  const roundedActual = Math.round(actualDiscountPct * 10) / 10;

  if (claimedDiscountPct !== undefined && claimedDiscountPct >= FAKE_SALE_CLAIMED_THRESHOLD) {
    if (actualDiscountPct < FAKE_SALE_ACTUAL_UPPER) {
      const result: SaleDetectionResult = {
        verdict: "fake-sale",
        explanation: `Page claims ${claimedDiscountPct.toFixed(0)}% off, but current price is only ${roundedActual.toFixed(1)}% below the 90-day median ($${stats.median.toFixed(2)}). The "sale" is synthetic.`,
        discountClaimed: claimedDiscountPct,
        discountActual: roundedActual,
      };
      return result;
    }
  }

  if (actualDiscountPct >= GENUINE_STDDEV_MULTIPLIER * (stats.stddev / stats.median) * 100) {
    const result: SaleDetectionResult = {
      verdict: "genuine-sale",
      explanation: `Current price ($${stats.current.toFixed(2)}) is ${roundedActual.toFixed(1)}% below the 90-day median ($${stats.median.toFixed(2)}) — a real dip beyond normal variance.`,
      discountActual: roundedActual,
    };
    if (claimedDiscountPct !== undefined) result.discountClaimed = claimedDiscountPct;
    return result;
  }

  if (actualDiscountPct >= 1 && actualDiscountPct <= MODEST_DIP_UPPER_PCT) {
    return {
      verdict: "modest-dip",
      explanation: `Current price is ${roundedActual.toFixed(1)}% below the 90-day median — a small dip, not a real sale.`,
      discountActual: roundedActual,
      ...(claimedDiscountPct !== undefined ? { discountClaimed: claimedDiscountPct } : {}),
    };
  }

  if (actualDiscountPct < 0) {
    return {
      verdict: "no-sale",
      explanation: `Current price ($${stats.current.toFixed(2)}) is ${Math.abs(roundedActual).toFixed(1)}% ABOVE the 90-day median ($${stats.median.toFixed(2)}).`,
      discountActual: roundedActual,
      ...(claimedDiscountPct !== undefined ? { discountClaimed: claimedDiscountPct } : {}),
    };
  }

  return {
    verdict: "no-sale",
    explanation: `Current price ($${stats.current.toFixed(2)}) is within 1% of the 90-day median.`,
    discountActual: roundedActual,
    ...(claimedDiscountPct !== undefined ? { discountClaimed: claimedDiscountPct } : {}),
  };
}
