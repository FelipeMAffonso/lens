// CJ-W46 — pure reranker.
// Given candidates (with base utilities) + an overlay, re-sort by the
// weighted-signal-augmented utility and emit per-candidate contributions.

import type {
  RerankCandidate,
  RerankContribution,
  RerankResponse,
  RerankResultEntry,
  ValuesOverlay,
} from "@lens/shared";
import { activeKeys, getValueSignals } from "./signals.js";

export function applyOverlay(candidates: RerankCandidate[], overlay: ValuesOverlay): RerankResponse {
  const keys = activeKeys(overlay);
  const overlayActive = keys.length > 0 && overlay.some((e) => e.weight > 0);

  const entries: RerankResultEntry[] = candidates.map((c) => {
    const signals = getValueSignals(c, keys, overlay);
    const contributions: RerankContribution[] = overlay
      .filter((e) => e.weight > 0)
      .map((e) => ({
        key: e.key,
        weight: e.weight,
        signal: signals[e.key] ?? 0,
        contribution: round4((signals[e.key] ?? 0) * e.weight),
      }));
    const overlayBoost = contributions.reduce((s, r) => s + r.contribution, 0);
    const entry: RerankResultEntry = {
      id: c.id,
      name: c.name,
      baseUtility: round4(c.baseUtility),
      finalUtility: round4(c.baseUtility + overlayBoost),
      contributions,
    };
    if (c.brand) entry.brand = c.brand;
    return entry;
  });

  // Sort DESC by finalUtility; stable on tie (preserve original order).
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (b.e.finalUtility !== a.e.finalUtility) return b.e.finalUtility - a.e.finalUtility;
      return a.i - b.i;
    })
    .map((x) => x.e);

  return {
    ranked: sorted,
    overlayActive,
    keysUsed: keys,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
