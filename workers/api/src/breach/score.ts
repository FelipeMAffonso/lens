// S4-W26 — deterministic breach-history score.

import type { BreachAggregate, BreachBand, BreachRecord, BreachSeverity } from "./types.js";

const SEVERITY_WEIGHT: Record<BreachSeverity, number> = {
  critical: 25,
  high: 15,
  moderate: 8,
  low: 3,
};

const MS_YEAR = 365 * 86_400_000;

function recencyMultiplier(yearsSinceBreach: number): number {
  if (yearsSinceBreach < 0) return 1;
  if (yearsSinceBreach <= 2) return 1;
  if (yearsSinceBreach <= 5) return 0.7;
  if (yearsSinceBreach <= 10) return 0.4;
  return 0;
}

export interface AggregateInput {
  breaches: BreachRecord[];
  now?: Date;
}

export function aggregateBreaches(input: AggregateInput): BreachAggregate {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  let count5yr = 0;
  let count10yr = 0;
  let totalRecords = 0;
  let mostRecent: string | null = null;
  let mostRecentMs: number | null = null;
  let hasSsn = false;
  let hasCard = false;
  let hasPassword = false;

  for (const b of input.breaches) {
    totalRecords += b.recordsExposed;
    const ageMs = nowMs - Date.parse(b.date);
    const years = ageMs / MS_YEAR;
    if (years <= 5) count5yr += 1;
    if (years <= 10) count10yr += 1;
    if (mostRecentMs === null || ageMs < mostRecentMs) {
      mostRecentMs = ageMs;
      mostRecent = b.date;
    }
    for (const t of b.dataTypes) {
      const tl = t.toLowerCase();
      if (tl === "ssn") hasSsn = true;
      if (tl === "card") hasCard = true;
      if (tl === "password") hasPassword = true;
    }
  }
  const yearsSinceMostRecent = mostRecentMs !== null ? round2(mostRecentMs / MS_YEAR) : null;

  return {
    count5yr,
    count10yr,
    totalRecordsExposed: totalRecords,
    mostRecentDate: mostRecent,
    yearsSinceMostRecent,
    hasSsnExposure: hasSsn,
    hasCardExposure: hasCard,
    hasPasswordExposure: hasPassword,
  };
}

export function computeScore(breaches: BreachRecord[], now = new Date()): number {
  const nowMs = now.getTime();
  let score = 0;
  for (const b of breaches) {
    const years = (nowMs - Date.parse(b.date)) / MS_YEAR;
    if (years > 10 || years < 0) continue;
    const w = SEVERITY_WEIGHT[b.severity];
    score += w * recencyMultiplier(years);
  }
  const agg = aggregateBreaches({ breaches, now });
  if (agg.hasSsnExposure && (agg.yearsSinceMostRecent ?? Infinity) < 5) score += 15;
  if (agg.hasCardExposure && (agg.yearsSinceMostRecent ?? Infinity) < 5) score += 10;
  if (agg.hasPasswordExposure && (agg.yearsSinceMostRecent ?? Infinity) < 5) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function bandFor(score: number): BreachBand {
  if (score < 5) return "none";
  if (score < 20) return "low";
  if (score < 40) return "moderate";
  if (score < 70) return "high";
  return "critical";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
