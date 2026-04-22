// S4-W21 — price-series statistics: median, stddev, min, max.

import type { PricePoint } from "./types.js";

export interface SeriesStats {
  count: number;
  median: number;
  mean: number;
  min: number;
  max: number;
  stddev: number;
  current: number;
}

/**
 * Compute summary statistics over a reverse-chronological price series
 * (newest first). If empty, returns zeroed stats.
 */
export function computeStats(series: PricePoint[]): SeriesStats {
  if (series.length === 0) {
    return { count: 0, median: 0, mean: 0, min: 0, max: 0, stddev: 0, current: 0 };
  }
  const prices = series.map((p) => p.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 === 0
      ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
      : sorted[(n - 1) / 2]!;
  const sum = prices.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sqDiff = prices.reduce((a, p) => a + (p - mean) ** 2, 0);
  const stddev = Math.sqrt(sqDiff / n);
  return {
    count: n,
    median: round2(median),
    mean: round2(mean),
    min: round2(sorted[0]!),
    max: round2(sorted[n - 1]!),
    stddev: round2(stddev),
    current: round2(series[0]!.price),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
