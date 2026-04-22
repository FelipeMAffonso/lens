// S3-W18 — composite counterfeit-risk scorer.

import { analyzeBimodal } from "./bimodal.js";
import type {
  CounterfeitRequest,
  CounterfeitResponse,
  FeedbackProfile,
  OverallVerdict,
  SignalResult,
} from "./types.js";

// Category "floor" = minimum LEGITIMATE product price for mid-range SKUs.
// Prices below floor/3 are impossibly low → counterfeit-price signal.
// Kept in sync with scam/assess.ts via PR — update both together.
const CATEGORY_PRICE_FLOOR: Record<string, number> = {
  laptops: 900,
  laptop: 900,
  "espresso machines": 300,
  "espresso machine": 300,
  headphones: 80,
  televisions: 500,
  tv: 500,
  smartphones: 500,
  smartphone: 500,
  cameras: 700,
  camera: 700,
  watches: 150,
};

export function assessCounterfeit(req: CounterfeitRequest): CounterfeitResponse {
  const signals: SignalResult[] = [];
  let risk = 0;
  let feedbackProfile: FeedbackProfile | undefined;

  // 1. Seller age.
  if (typeof req.sellerAgeDays === "number") {
    if (req.sellerAgeDays < 90) {
      signals.push({
        id: "seller-age-too-new",
        verdict: "fail",
        detail: `Seller registered ${req.sellerAgeDays} days ago — below the 90-day authenticity-risk threshold.`,
      });
      risk += 25;
    } else if (req.sellerAgeDays < 180) {
      signals.push({
        id: "seller-age-recent",
        verdict: "warn",
        detail: `Seller registered ${req.sellerAgeDays} days ago — still relatively new (< 180 days).`,
      });
      risk += 10;
    } else {
      signals.push({
        id: "seller-age-ok",
        verdict: "ok",
        detail: `Seller registered ${req.sellerAgeDays} days ago — established.`,
      });
    }
  }

  // 2. Feedback volume.
  if (typeof req.feedbackCount === "number") {
    if (req.feedbackCount < 10) {
      signals.push({
        id: "feedback-volume-low",
        verdict: "warn",
        detail: `Only ${req.feedbackCount} feedback entries — insufficient reputation signal.`,
      });
      risk += 15;
    } else {
      signals.push({
        id: "feedback-volume-ok",
        verdict: "ok",
        detail: `${req.feedbackCount.toLocaleString()} feedback entries.`,
      });
    }
  }

  // 3. Bimodal distribution.
  if (req.feedbackDistribution) {
    feedbackProfile = analyzeBimodal(req.feedbackDistribution);
    if (feedbackProfile.total > 0) {
      if (feedbackProfile.bimodal) {
        signals.push({
          id: "feedback-distribution-bimodal",
          verdict: "fail",
          detail: `Feedback distribution is bimodal (${(feedbackProfile.p1 * 100).toFixed(0)}% 1-star, ${(feedbackProfile.p5 * 100).toFixed(0)}% 5-star) — characteristic of review manipulation combined with genuine defrauded-buyer anger.`,
        });
        risk += 25;
      } else {
        signals.push({
          id: "feedback-distribution-natural",
          verdict: "ok",
          detail: `Feedback distribution follows a natural shape (${(feedbackProfile.p1 * 100).toFixed(0)}% 1-star, ${(feedbackProfile.p5 * 100).toFixed(0)}% 5-star).`,
        });
      }
    }
  }

  // 4. Price-too-low.
  if (req.category && typeof req.price === "number") {
    const floor = CATEGORY_PRICE_FLOOR[req.category.toLowerCase()];
    if (floor !== undefined && req.price < floor / 3) {
      signals.push({
        id: "price-too-low",
        verdict: "fail",
        detail: `Price $${req.price.toFixed(2)} is less than one-third the typical floor ($${floor.toFixed(2)}) for category "${req.category}" — counterfeit-price signal.`,
      });
      risk += 30;
    } else if (floor !== undefined) {
      signals.push({
        id: "price-plausible",
        verdict: "ok",
        detail: `Price $${req.price.toFixed(2)} is plausible for the ${req.category} category.`,
      });
    }
  }

  // 5. Unauthorized-retailer claim.
  if (req.authorizedRetailerClaim === true) {
    signals.push({
      id: "unauthorized-retailer-claim",
      verdict: "warn",
      detail: "Seller claims 'authorized retailer' status — Lens cannot verify this; check the brand's official reseller list.",
    });
    risk += 10;
  }

  // 6. Grey-market indicators.
  if (req.greyMarketIndicators && req.greyMarketIndicators.length > 0) {
    const cappedPenalty = Math.min(20, req.greyMarketIndicators.length * 10);
    signals.push({
      id: "grey-market-indicator",
      verdict: "warn",
      detail: `Grey-market signals detected: ${req.greyMarketIndicators.join(", ")}. Unit may lack US warranty or manufacturer support.`,
    });
    risk += cappedPenalty;
  }

  // Empty signal list → insufficient-data bullet (never return [] per Apple
  // bar §10).
  if (signals.length === 0) {
    signals.push({
      id: "insufficient-data",
      verdict: "warn",
      detail: "No seller / pricing / feedback signals supplied — Lens cannot form a counterfeit verdict.",
    });
  }

  if (risk < 0) risk = 0;
  if (risk > 100) risk = 100;
  const verdict: OverallVerdict = risk < 20 ? "authentic" : risk < 50 ? "caution" : "likely-counterfeit";

  return {
    host: req.host,
    verdict,
    riskScore: risk,
    signals,
    ...(feedbackProfile ? { feedbackProfile } : {}),
    generatedAt: new Date().toISOString(),
  };
}
