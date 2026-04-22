// S7-W39 — pure utility ranker for accessory discovery.
// Utility Uⱼ = Σᵢ wᵢ · sᵢⱼ where s is each accessory's score on criterion i,
// min/max-normalized across the compat-passing set. Contributions are
// exposed per-candidate so the UI can narrate "why #1 beats #2".

import type { AccessoryFixture } from "./types.js";

const DEFAULT_CRITERIA = { quality: 0.5, price: 0.3, longevity: 0.2 };

export interface RankedAccessory {
  accessory: AccessoryFixture;
  utility: number;
  contributions: Record<string, number>;
}

function normalizeWeights(criteria: Record<string, number>): Record<string, number> {
  const entries = Object.entries(criteria).filter(([, v]) => v > 0);
  if (entries.length === 0) return { ...DEFAULT_CRITERIA };
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum <= 0) return { ...DEFAULT_CRITERIA };
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

function pickScore(acc: AccessoryFixture, criterion: string): number | null {
  // "price" requests the value-per-dollar score (stored as price_score so
  // higher = better); falls through to "price_score" key directly.
  if (criterion === "price" && typeof acc.specs["price_score"] === "number") {
    return acc.specs["price_score"]!;
  }
  const v = acc.specs[criterion];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function rankAccessories(
  compatPassing: AccessoryFixture[],
  criteria?: Record<string, number>,
): RankedAccessory[] {
  if (compatPassing.length === 0) return [];
  const weights = normalizeWeights(criteria ?? DEFAULT_CRITERIA);
  const critKeys = Object.keys(weights);

  // Min/max normalize each criterion across the compat-passing set.
  const ranges: Record<string, { min: number; max: number }> = {};
  for (const k of critKeys) {
    const vals = compatPassing.map((a) => pickScore(a, k)).filter((v): v is number => v !== null);
    if (vals.length === 0) {
      ranges[k] = { min: 0, max: 1 };
    } else {
      ranges[k] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
  }

  const ranked: RankedAccessory[] = compatPassing.map((acc) => {
    const contributions: Record<string, number> = {};
    let total = 0;
    for (const k of critKeys) {
      const raw = pickScore(acc, k);
      const range = ranges[k]!;
      let s = 0;
      if (raw !== null && range.max !== range.min) {
        s = (raw - range.min) / (range.max - range.min);
      } else if (raw !== null) {
        // all candidates identical → uniform 1
        s = 1;
      }
      const contrib = weights[k]! * s;
      contributions[k] = round4(contrib);
      total += contrib;
    }
    return { accessory: acc, utility: round4(total), contributions };
  });

  ranked.sort((a, b) => b.utility - a.utility);
  return ranked;
}
