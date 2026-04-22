// S4-W28 — pure composite aggregator.

import type {
  CheckoutSummaryRequest,
  CheckoutSummaryResponse,
  RationaleItem,
  Verdict,
} from "./types.js";

const START_SCORE = 100;

export function composeSummary(req: CheckoutSummaryRequest): CheckoutSummaryResponse {
  const rationale: RationaleItem[] = [];
  let score = START_SCORE;
  let signalCount = 0;

  // ─── priceHistory ─────────────────────────────────────────────────────
  const ph = req.signals.priceHistory;
  if (ph) {
    signalCount += 1;
    if (ph.verdict === "fake-sale") {
      score -= 25;
      rationale.push({
        signal: "priceHistory",
        severity: "blocker",
        message:
          ph.discountClaimed !== undefined && ph.discountActual !== undefined
            ? `Page claims ${ph.discountClaimed.toFixed(0)}% off, but the real drop vs 90-day median is ${ph.discountActual.toFixed(1)}%.`
            : "Fake sale detected — the advertised discount is not supported by the 90-day price history.",
      });
    } else if (ph.verdict === "modest-dip") {
      rationale.push({
        signal: "priceHistory",
        severity: "info",
        message: "Small price dip vs 90-day median.",
      });
    } else if (ph.verdict === "genuine-sale") {
      score += 5;
      rationale.push({
        signal: "priceHistory",
        severity: "info",
        message: "Genuine price drop — current price is well below the 90-day median.",
      });
    } else if (ph.verdict === "insufficient-data") {
      rationale.push({
        signal: "priceHistory",
        severity: "info",
        message: "Insufficient price history to judge sale legitimacy.",
      });
    }
  }

  // ─── totalCost ────────────────────────────────────────────────────────
  const tc = req.signals.totalCost;
  if (tc && tc.upfront > 0) {
    signalCount += 1;
    const ratio = tc.year1 / tc.upfront;
    if (ratio > 3) {
      score -= 20;
      rationale.push({
        signal: "totalCost",
        severity: "blocker",
        message: `Year-1 cost is ${ratio.toFixed(1)}× the sticker ($${tc.year1.toFixed(2)} vs $${tc.upfront.toFixed(2)}). Hidden operating costs dominate the purchase.`,
      });
    } else if (ratio > 1.5) {
      score -= 10;
      rationale.push({
        signal: "totalCost",
        severity: "warn",
        message: `Year-1 cost is ${ratio.toFixed(1)}× the sticker — factor in operating costs.`,
      });
    } else {
      rationale.push({
        signal: "totalCost",
        severity: "info",
        message: "Year-1 operating costs are modest relative to sticker.",
      });
    }
  }

  // ─── passiveScan ──────────────────────────────────────────────────────
  const ps = req.signals.passiveScan;
  if (ps) {
    signalCount += 1;
    if (ps.confirmedCount >= 1) {
      const penalty = Math.min(30, ps.confirmedCount * 10);
      score -= penalty;
      const severity: RationaleItem["severity"] = ps.confirmedCount >= 2 ? "blocker" : "warn";
      const topHint = ps.topPattern ? ` (including ${ps.topPattern})` : "";
      rationale.push({
        signal: "passiveScan",
        severity,
        message: `${ps.confirmedCount} dark-pattern${ps.confirmedCount === 1 ? "" : "s"} confirmed on this page${topHint}.`,
      });
    }
  }

  // ─── breachHistory ────────────────────────────────────────────────────
  const bh = req.signals.breachHistory;
  if (bh) {
    signalCount += 1;
    if (bh.band === "critical") {
      score -= 30;
      rationale.push({
        signal: "breachHistory",
        severity: "blocker",
        message: `${req.host} has a critical breach history (score ${bh.score}/100).`,
      });
    } else if (bh.band === "high") {
      score -= 15;
      rationale.push({
        signal: "breachHistory",
        severity: "warn",
        message: `${req.host} has a high breach history (score ${bh.score}/100).`,
      });
    } else if (bh.band === "moderate") {
      score -= 5;
      rationale.push({
        signal: "breachHistory",
        severity: "info",
        message: `${req.host} has a moderate breach history.`,
      });
    }
    if (bh.hasSsnExposure && (bh.band === "moderate" || bh.band === "high" || bh.band === "critical")) {
      score -= 10;
      rationale.push({
        signal: "breachHistory",
        severity: "warn",
        message: `Past breach at ${req.host} exposed SSNs.`,
      });
    }
  }

  // ─── compat ───────────────────────────────────────────────────────────
  const co = req.signals.compat;
  if (co) {
    signalCount += 1;
    if (co.overall === "incompatible") {
      score -= 40;
      rationale.push({
        signal: "compat",
        severity: "blocker",
        message: `Incompatible with your equipment${co.blockerCount ? ` (${co.blockerCount} blocker${co.blockerCount === 1 ? "" : "s"})` : ""}.`,
      });
    } else if (co.overall === "partial") {
      score -= 10;
      rationale.push({
        signal: "compat",
        severity: "warn",
        message: "Partial compatibility — check the issues list before buying.",
      });
    } else if (co.overall === "compatible") {
      score += 5;
      rationale.push({
        signal: "compat",
        severity: "info",
        message: "Compatible with your equipment.",
      });
    } else {
      // no-rule-matched: surface neutrally so user knows Lens didn't check.
      rationale.push({
        signal: "compat",
        severity: "info",
        message: "No compatibility rules covered this pair; check manually.",
      });
    }
  }

  // ─── provenance ───────────────────────────────────────────────────────
  const pr = req.signals.provenance;
  if (pr) {
    signalCount += 1;
    if (pr.affiliateIndicatorCount >= 2) {
      score -= 10;
      rationale.push({
        signal: "provenance",
        severity: "warn",
        message: `${pr.affiliateIndicatorCount} affiliate indicators in cited sources — the recommendation may be commission-biased.`,
      });
    }
    if (pr.worstClaimFoundVia === "none") {
      score -= 15;
      rationale.push({
        signal: "provenance",
        severity: "warn",
        message: "At least one cited claim was not actually present on its source page.",
      });
    }
    if (pr.minScore !== undefined && pr.minScore < 0.5) {
      score -= 10;
      rationale.push({
        signal: "provenance",
        severity: "warn",
        message: `Lowest source provenance score is ${pr.minScore.toFixed(2)} (< 0.5).`,
      });
    }
  }

  // Clamp score.
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  // Verdict banding with blocker-dominance rule.
  const hasBlocker = rationale.some((r) => r.severity === "blocker");
  let verdict: Verdict;
  if (score >= 70 && !hasBlocker) verdict = "proceed";
  else if (score >= 40) verdict = "hesitate";
  else verdict = "rethink";
  // Blocker downgrades proceed → hesitate (never lets a blocker slip through
  // to a clean verdict).
  if (hasBlocker && verdict === "proceed") verdict = "hesitate";

  if (rationale.length === 0) {
    rationale.push({
      signal: "none",
      severity: "info",
      message: "No concerns detected — Lens hasn't observed signals worth flagging on this page.",
    });
  }

  const recommendation = recommendationFor(verdict, hasBlocker, signalCount);

  return {
    verdict,
    score: Math.round(score),
    rationale,
    recommendation,
    signalCount,
    generatedAt: new Date().toISOString(),
  };
}

function recommendationFor(verdict: Verdict, hasBlocker: boolean, signalCount: number): string {
  if (signalCount === 0) {
    return "Lens has no signals for this page yet — proceed with your usual scrutiny.";
  }
  if (verdict === "proceed") {
    return "Lens found no concerns — this looks safe to complete.";
  }
  if (verdict === "hesitate") {
    return hasBlocker
      ? "At least one blocker was flagged — review the rationale before completing the purchase."
      : "Several concerns stacked up — worth pausing to read the rationale before committing.";
  }
  return "Lens strongly recommends rethinking this purchase — see the rationale list.";
}
