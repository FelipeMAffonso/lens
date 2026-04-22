// S4-W21 — deterministic price-series fixture generator.
//
// When Keepa / real data source is unavailable, Lens synthesizes a
// plausible 90-day series keyed on the canonical URL. The same URL
// always produces the same series (for reproducible demo + tests).

import type { PricePoint } from "./types.js";

// FNV-1a 32-bit hash, good enough for deterministic seeding.
function hash32(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Mulberry32 deterministic PRNG. Same seed → same sequence.
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produce a 90-day reverse-chronological price series from a URL hash.
 *
 * The generator deliberately varies the "scenario" by hash bucket:
 *   bucket 0-24   → stable price (no-sale)
 *   bucket 25-49  → gentle downtrend (genuine sale today)
 *   bucket 50-74  → fake-sale (claimed discount, actual flat)
 *   bucket 75-99  → moderate volatility (modest dip)
 *
 * Bucket = hash(url) % 100.
 *
 * This is NOT real price data; it's a stable demo surface. Real data
 * comes from keepa.ts when KEEPA_API_KEY is set.
 */
export function generateFixtureSeries(
  canonicalUrl: string,
  days = 90,
  anchorDateMs = Date.UTC(2026, 3, 21), // 2026-04-21 UTC, stable
): { series: PricePoint[]; bucket: number; basePrice: number } {
  const h = hash32(canonicalUrl);
  const rng = mulberry32(h);
  const bucket = h % 100;
  // Base price: $50 ... $1500, deterministic
  const basePrice = Math.round((50 + rng() * 1450) * 100) / 100;

  const series: PricePoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(anchorDateMs - i * 86_400_000);
    const dayIdx = days - 1 - i; // 0 = oldest, days-1 = today
    let price = basePrice;
    if (bucket < 25) {
      // Stable, tiny noise
      price *= 1 + (rng() - 0.5) * 0.01;
    } else if (bucket < 50) {
      // Gentle downtrend (last 5 days notably lower)
      const progress = dayIdx / days;
      price *= 0.82 + 0.2 * (1 - progress);
      price *= 1 + (rng() - 0.5) * 0.015;
    } else if (bucket < 75) {
      // Fake sale: flat historical + sudden today-only drop of ~3% AFTER
      // showing a "30% off" banner in the UI. Most of the series stays flat.
      if (dayIdx === days - 1) {
        price *= 0.97;
      } else {
        price *= 1 + (rng() - 0.5) * 0.02;
      }
    } else {
      // Moderate volatility, today is ~3% under median.
      const noise = Math.sin((dayIdx / 90) * Math.PI * 2) * 0.04 + (rng() - 0.5) * 0.03;
      price *= 1 + noise;
      if (dayIdx === days - 1) price *= 0.97;
    }
    series.push({
      date: date.toISOString().slice(0, 10),
      price: Math.round(price * 100) / 100,
    });
  }
  // Already newest-first (i=0 is today, ascending i = older dates), so
  // return as-is. Previous code erroneously reversed this order.
  return { series, bucket, basePrice };
}
