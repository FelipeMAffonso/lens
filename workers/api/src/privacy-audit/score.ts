// S4-W25 — pure transparency-score + band.

import type { Band, PrivacyAudit } from "./types.js";

const BASE = 50;

export function computeTransparencyScore(audit: PrivacyAudit): number {
  let score = BASE;

  // +5 per regulatory framework, cap +15.
  score += Math.min(15, audit.regulatoryFrameworks.length * 5);

  // Deletion available
  if (audit.deletion.available) score += 10;

  // Retention declared with specific period
  if (audit.retention.declared && audit.retention.period && !/indefinite|as\s+long\s+as\s+necessary/i.test(audit.retention.period)) {
    score += 10;
  } else if (audit.retention.declared) {
    score += 3;
  }

  // Transparency about data collection — caps at +15 to avoid rewarding the
  // vendor for being extra aggressive about listing things they collect.
  score += Math.min(15, audit.dataCollected.length * 5);

  // Specific third-party enumeration (not "trusted partners" etc.) — if the
  // non-specific-sharing dark pattern did NOT fire, award +5.
  if (
    audit.sharedWithThirdParties.length > 0 &&
    !audit.consentDarkPatterns.some((p) => p.pattern === "non-specific-sharing")
  ) {
    score += 5;
  }

  // Subtract per dark pattern.
  for (const p of audit.consentDarkPatterns) {
    score += p.severity === "blocker" ? -20 : -10;
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
}

export function bandFor(score: number): Band {
  if (score < 40) return "low";
  if (score < 70) return "moderate";
  return "high";
}
