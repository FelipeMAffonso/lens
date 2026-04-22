// S6-W34 — pure claim-eligibility detector.
// Given a purchase + the current market price + the retailer window, return
// a deterministic ClaimDecision. No I/O. No dates-from-Date.now() hidden.

import type { ClaimDecision, PurchaseLike, RetailerWindow } from "./types.js";

export interface DetectInput {
  purchase: PurchaseLike;
  currentPrice: number | null;
  now: Date;
  window: RetailerWindow | null;
}

const MIN_ABSOLUTE_DELTA_USD = 1;
const MIN_RELATIVE_DELTA = 0.02; // 2%

export function detectClaim(input: DetectInput): ClaimDecision {
  const { purchase, currentPrice, now, window } = input;

  if (!window) {
    return {
      claim: false,
      reason: "retailer policy not known to Lens",
    };
  }

  if (!window.active) {
    return {
      claim: false,
      reason: window.note
        ? `${window.retailer} does not offer price matching. ${window.note}`
        : `${window.retailer} does not offer price matching.`,
    };
  }

  if (purchase.price == null || !Number.isFinite(purchase.price)) {
    return { claim: false, reason: "original price unknown" };
  }
  if (currentPrice == null || !Number.isFinite(currentPrice)) {
    return { claim: false, reason: "current price unavailable" };
  }

  const purchasedAt = new Date(purchase.purchasedAt);
  if (Number.isNaN(purchasedAt.getTime())) {
    return { claim: false, reason: "invalid purchase date" };
  }
  const msInWindow = window.days * 86_400_000;
  const elapsedMs = now.getTime() - purchasedAt.getTime();
  if (elapsedMs < 0) {
    return { claim: false, reason: "purchase date is in the future" };
  }
  if (elapsedMs > msInWindow) {
    return {
      claim: false,
      reason: `${window.retailer} price-match window of ${window.days} day${window.days === 1 ? "" : "s"} elapsed (bought ${Math.floor(elapsedMs / 86_400_000)} days ago)`,
    };
  }

  const delta = round2(purchase.price - currentPrice);
  if (delta <= 0) {
    return {
      claim: false,
      reason: "current price is at or above your purchase price",
      currentPrice,
    };
  }
  if (delta < MIN_ABSOLUTE_DELTA_USD) {
    return {
      claim: false,
      reason: `drop is too small ($${delta.toFixed(2)}); minimum ${MIN_ABSOLUTE_DELTA_USD.toFixed(2)}`,
      currentPrice,
    };
  }
  const deltaPct = round4(delta / purchase.price);
  if (deltaPct < MIN_RELATIVE_DELTA) {
    return {
      claim: false,
      reason: `drop is below ${(MIN_RELATIVE_DELTA * 100).toFixed(0)}% (actual ${(deltaPct * 100).toFixed(1)}%)`,
      currentPrice,
    };
  }

  const expiresAt = new Date(purchasedAt.getTime() + msInWindow).toISOString().slice(0, 10);
  return {
    claim: true,
    delta,
    deltaPct,
    windowDays: window.days,
    expiresAt,
    originalPrice: purchase.price,
    currentPrice: round2(currentPrice),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
