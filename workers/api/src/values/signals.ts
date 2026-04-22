// CJ-W46 — value-signal computation per candidate.
// Each signal returns a number in [-1, 1]. 0 = neutral / no evidence.

import type { RerankCandidate, ValueKey, ValuesOverlayEntry } from "@lens/shared";
import {
  ANIMAL_WELFARE_BRANDS,
  B_CORP_BRANDS,
  SMALL_BUSINESS_BRANDS,
  UNION_US_BRANDS,
  USA_MADE_BRANDS,
  brandMatches,
  repairabilityFromBrand,
} from "./brands.js";

/**
 * Produce a signals map for the given candidate. When the candidate already
 * carries a `valuesSignals` payload (from a pack-supplied SKU), that takes
 * priority — we ONLY fill in missing keys from heuristics.
 */
export function getValueSignals(
  candidate: RerankCandidate,
  keys: ValueKey[],
  overlay: ValuesOverlayEntry[],
): Record<ValueKey, number> {
  const signals: Partial<Record<ValueKey, number>> = { ...(candidate.valuesSignals ?? {}) };
  for (const key of keys) {
    if (signals[key] !== undefined) continue;
    signals[key] = heuristicFor(key, candidate, overlay);
  }
  return signals as Record<ValueKey, number>;
}

function heuristicFor(
  key: ValueKey,
  c: RerankCandidate,
  overlay: ValuesOverlayEntry[],
): number {
  const brand = c.brand;
  const name = c.name.toLowerCase();
  const coo = c.countryOfOrigin?.toUpperCase();
  switch (key) {
    case "country-of-origin": {
      const pref = overlay.find((e) => e.key === "country-of-origin")?.preference?.toUpperCase();
      if (!pref) return 0;
      if (coo && coo === pref) return 1;
      if (pref === "US" && (brandMatches(brand, USA_MADE_BRANDS) || /\bmade in (the )?usa\b/i.test(c.name))) return 1;
      if (coo && coo !== pref) return -0.5;
      return 0;
    }
    case "union-made":
      if (brandMatches(brand, UNION_US_BRANDS)) return 1;
      if (/\bunion[- ]made\b|\buaw\b/i.test(name)) return 0.8;
      return 0;
    case "carbon-footprint": {
      // Without LCA data, we return 0 (neutral) unless the candidate name
      // contains explicit "low carbon" claims (keeping this conservative so
      // marketing greenwash doesn't win rankings).
      if (/\bzero[- ]emission\b|\bcarbon[- ]neutral\b/i.test(name)) return 0.4;
      return 0;
    }
    case "animal-welfare":
      if (brandMatches(brand, ANIMAL_WELFARE_BRANDS)) return 1;
      if (/\bvegan\b|\bcruelty[- ]free\b|\bleaping bunny\b/i.test(name)) return 0.8;
      return 0;
    case "b-corp":
      if (brandMatches(brand, B_CORP_BRANDS)) return 1;
      if (/\bb[- ]?corp\b/i.test(name)) return 0.7;
      return 0;
    case "small-business":
      if (brandMatches(brand, SMALL_BUSINESS_BRANDS)) return 1;
      return 0;
    case "repairability": {
      const score = repairabilityFromBrand(brand);
      return score * 2 - 1; // map [0,1] → [-1, 1]
    }
    default:
      return 0;
  }
}

/**
 * Helper: which keys is the overlay requesting signals for?
 */
export function activeKeys(overlay: ValuesOverlayEntry[]): ValueKey[] {
  const seen = new Set<ValueKey>();
  for (const e of overlay) {
    if (e.weight > 0) seen.add(e.key);
  }
  return [...seen];
}
